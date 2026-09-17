"use server";

import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { cheminStockage, verifierFichier } from "@/lib/documents-depot";
import { enCentimes, formaterMontant, lireMontant, montantTTC, situationFacture, TAUX_TVA, TYPES_PAYEUR } from "@/lib/factures";
import { journaliser } from "@/lib/journal";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";
import { aujourdhuiUTC, jourDepuisSaisie } from "@/lib/sessions-libelles";
import { stockage, StockageNonConfigure } from "@/lib/stockage";

export type EtatFormulaire = { erreur?: string; succes?: string; valeurs?: Record<string, string> };

function saisie(donnees: FormData): Record<string, string> {
  return Object.fromEntries([...donnees.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;
}

function rafraichir(facture: { id: string; sessionId: string | null }) {
  revalidatePath("/factures");
  revalidatePath(`/factures/${facture.id}`);
  revalidatePath("/paiements");
  revalidatePath("/tableau-de-bord");
  if (facture.sessionId) revalidatePath(`/sessions/${facture.sessionId}`);
}

const texteFacultatif = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

const schemaFacture = z.object({
  objet: z.string().trim().min(1, "Indiquez l'objet de la facture."),
  sessionId: texteFacultatif,
  companyId: texteFacultatif,
  learnerId: texteFacultatif,
  payeurType: z.enum(TYPES_PAYEUR as [string, ...string[]]),
  payeurNom: z.string().trim().min(1, "Indiquez le nom du payeur."),
  montantHT: z.string(),
  tauxTva: z.enum(TAUX_TVA as [string, ...string[]], { message: "Taux de TVA invalide." }),
  notes: texteFacultatif,
});

async function lireFacture(donnees: FormData) {
  const r = schemaFacture.safeParse(saisie(donnees));
  if (!r.success) return { erreur: r.error.issues[0]?.message ?? "Saisie invalide." } as const;
  const ht = lireMontant(r.data.montantHT);
  if (!ht || enCentimes(ht) <= 0) return { erreur: "Le montant HT doit être un montant positif, ex. 1250 ou 1250,50." } as const;

  const [session, entreprise, apprenant] = await Promise.all([
    r.data.sessionId ? prisma.trainingSession.findFirst({ where: { id: r.data.sessionId, deletedAt: null } }) : null,
    r.data.companyId ? prisma.company.findFirst({ where: { id: r.data.companyId, deletedAt: null } }) : null,
    r.data.learnerId ? prisma.learner.findFirst({ where: { id: r.data.learnerId, deletedAt: null } }) : null,
  ]);
  if ((r.data.sessionId && !session) || (r.data.companyId && !entreprise) || (r.data.learnerId && !apprenant)) {
    return { erreur: "Un des éléments rattachés n'existe plus. Rechargez la page." } as const;
  }

  return {
    data: {
      objet: r.data.objet,
      sessionId: r.data.sessionId ?? null,
      companyId: r.data.companyId ?? null,
      learnerId: r.data.learnerId ?? null,
      payeurType: r.data.payeurType as never,
      payeurNom: r.data.payeurNom,
      montantHT: ht,
      tauxTva: r.data.tauxTva,
      montantTTC: montantTTC(ht, r.data.tauxTva),
      notes: r.data.notes ?? null,
    },
  } as const;
}

export async function creerFacture(_precedent: EtatFormulaire, donnees: FormData): Promise<EtatFormulaire> {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");
  const l = await lireFacture(donnees);
  if ("erreur" in l) return { erreur: l.erreur, valeurs: saisie(donnees) };

  const facture = await prisma.facture.create({ data: { ...l.data, createdById: utilisateur.id } });
  await journaliser({
    action: "invoice.prepared",
    summary: `Facture préparée : ${facture.objet} — ${formaterMontant(facture.montantTTC)} TTC (${facture.payeurNom})`,
    entityType: "Facture",
    entityId: facture.id,
    userId: utilisateur.id,
  });
  rafraichir(facture);
  redirect(`/factures/${facture.id}`);
}

export async function modifierFacture(_precedent: EtatFormulaire, donnees: FormData): Promise<EtatFormulaire> {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");
  const id = String(donnees.get("id") ?? "");
  const existante = await prisma.facture.findUnique({ where: { id } });
  if (!existante) return { erreur: "Facture introuvable." };
  // Une facture émise ne se modifie plus : c'est un document comptable. On
  // l'annule par un avoir dans Henrri et on en prépare une nouvelle.
  if (existante.statut !== "A_EMETTRE") return { erreur: "Une facture émise ne peut plus être modifiée." };

  const l = await lireFacture(donnees);
  if ("erreur" in l) return { erreur: l.erreur, valeurs: saisie(donnees) };

  await prisma.facture.update({ where: { id }, data: l.data });
  await journaliser({ action: "invoice.updated", summary: `Facture modifiée : ${l.data.objet}`, entityType: "Facture", entityId: id, userId: utilisateur.id });
  rafraichir(existante);
  redirect(`/factures/${id}`);
}

/// Enregistre l'émission dans Henrri : numéro, dates et PDF de la facture.
export async function emettreFacture(_precedent: EtatFormulaire, donnees: FormData): Promise<EtatFormulaire> {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");
  const valeurs = saisie(donnees);
  const id = valeurs.id ?? "";

  const facture = await prisma.facture.findUnique({ where: { id } });
  if (!facture) return { erreur: "Facture introuvable." };
  if (facture.statut !== "A_EMETTRE") return { erreur: "Cette facture est déjà émise ou annulée." };

  const numero = (valeurs.numero ?? "").trim();
  if (!numero) return { erreur: "Indiquez le numéro attribué par Henrri.", valeurs };
  if (numero.length > 40) return { erreur: "Numéro trop long.", valeurs };
  const dateEmission = jourDepuisSaisie(valeurs.dateEmission ?? "");
  if (!dateEmission) return { erreur: "Indiquez la date d'émission.", valeurs };
  if (dateEmission > aujourdhuiUTC()) return { erreur: "La date d'émission ne peut pas être dans le futur.", valeurs };
  const dateEcheance = jourDepuisSaisie(valeurs.dateEcheance ?? "");
  if (!dateEcheance) return { erreur: "Indiquez la date d'échéance.", valeurs };
  if (dateEcheance < dateEmission) return { erreur: "L'échéance ne peut pas précéder l'émission.", valeurs };

  // PDF facultatif mais recommandé : rangé comme document « Facture ».
  const fichierBrut = donnees.get("fichier");
  let documentId: string | null = null;
  let chemin: string | null = null;
  if (fichierBrut instanceof File && fichierBrut.size > 0) {
    const fichier = await verifierFichier(fichierBrut);
    if (typeof fichier === "string") return { erreur: fichier, valeurs };
    if (fichier.typeMime !== "application/pdf") return { erreur: "La facture doit être un PDF.", valeurs };
    documentId = randomUUID();
    chemin = cheminStockage(documentId, 1, fichier.extension);
    try {
      await stockage().deposer(chemin, fichier.octets, fichier.typeMime);
    } catch (erreur) {
      if (erreur instanceof StockageNonConfigure) return { erreur: "Le stockage des documents n'est pas configuré.", valeurs };
      console.error("Dépôt du PDF de facture impossible :", erreur);
      return { erreur: "Le PDF n'a pas pu être enregistré. Réessayez.", valeurs };
    }
    const type = await prisma.documentType.findUniqueOrThrow({ where: { code: "FACTURE" } });
    await prisma.document.create({
      data: {
        id: documentId,
        nom: `Facture ${numero} — ${facture.payeurNom}`,
        typeId: type.id,
        categorie: "FINANCE",
        statut: "VALIDE",
        sessionId: facture.sessionId,
        companyId: facture.companyId,
        learnerId: facture.learnerId,
        createdById: utilisateur.id,
        versions: {
          create: {
            numero: 1,
            cheminStockage: chemin,
            nomFichier: fichier.nomFichier,
            typeMime: fichier.typeMime,
            taille: fichier.octets.byteLength,
            empreinte: fichier.empreinte,
            createdById: utilisateur.id,
          },
        },
      },
    });
  }

  try {
    await prisma.facture.update({
      where: { id, statut: "A_EMETTRE" },
      data: { numero, dateEmission, dateEcheance, statut: "EMISE", documentId },
    });
  } catch (erreur) {
    if (documentId && chemin) {
      await prisma.document.delete({ where: { id: documentId } }).catch(() => undefined);
      await stockage().supprimer([chemin]).catch(() => undefined);
    }
    if (erreur instanceof Prisma.PrismaClientKnownRequestError && erreur.code === "P2002") {
      return { erreur: `Le numéro ${numero} est déjà utilisé par une autre facture.`, valeurs };
    }
    throw erreur;
  }

  await journaliser({
    action: "invoice.issued",
    summary: `Facture ${numero} émise : ${facture.payeurNom} — ${formaterMontant(facture.montantTTC)} TTC`,
    entityType: "Facture",
    entityId: id,
    userId: utilisateur.id,
  });
  rafraichir(facture);
  return {};
}

export async function annulerFacture(donnees: FormData): Promise<void> {
  const utilisateur = await exigerRole("ADMIN");
  const id = String(donnees.get("id") ?? "");
  const facture = await prisma.facture.findUnique({ where: { id }, include: { _count: { select: { paiements: true } } } });
  if (!facture || facture.statut === "ANNULEE" || facture.statut === "PAYEE" || facture._count.paiements > 0) return;

  await prisma.facture.update({ where: { id }, data: { statut: "ANNULEE", annuleeAt: new Date() } });
  await journaliser({
    action: "invoice.cancelled",
    summary: `Facture ${facture.numero ?? "(non émise)"} annulée : ${facture.objet}`,
    entityType: "Facture",
    entityId: id,
    userId: utilisateur.id,
  });
  rafraichir(facture);
}

export async function ajouterPaiement(_precedent: EtatFormulaire, donnees: FormData): Promise<EtatFormulaire> {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");
  const valeurs = saisie(donnees);
  const r = z
    .object({
      factureId: z.string().min(1),
      montant: z.string(),
      date: z.string(),
      moyen: z.enum(["VIREMENT", "CHEQUE", "CARTE", "PRELEVEMENT", "ESPECES", "AUTRE"]),
      reference: z.string().trim().max(100).optional(),
    })
    .safeParse(valeurs);
  if (!r.success) return { erreur: "Saisie invalide.", valeurs };

  const montant = lireMontant(r.data.montant);
  if (!montant || enCentimes(montant) <= 0) return { erreur: "Le montant doit être positif.", valeurs };
  const date = jourDepuisSaisie(r.data.date);
  if (!date) return { erreur: "Indiquez la date de l'encaissement.", valeurs };
  if (date > aujourdhuiUTC()) return { erreur: "La date d'encaissement ne peut pas être dans le futur.", valeurs };

  // Transaction : deux encaissements saisis en même temps ne peuvent pas
  // dépasser ensemble le montant dû.
  const resultat = await prisma.$transaction(
    async (tx) => {
      const facture = await tx.facture.findUnique({ where: { id: r.data.factureId }, include: { paiements: true } });
      if (!facture) return { erreur: "Facture introuvable." };
      if (facture.statut !== "EMISE") return { erreur: "Seule une facture émise et non soldée peut recevoir un paiement." };
      const { resteCentimes } = situationFacture(facture, facture.paiements, aujourdhuiUTC());
      if (enCentimes(montant) > resteCentimes) {
        return { erreur: `Le montant dépasse le reste dû (${formaterMontant(resteCentimes / 100)}).` };
      }
      await tx.paiement.create({
        data: {
          factureId: facture.id,
          montant,
          date,
          moyen: r.data.moyen,
          reference: r.data.reference || null,
          createdById: utilisateur.id,
        },
      });
      const solde = enCentimes(montant) === resteCentimes;
      if (solde) await tx.facture.update({ where: { id: facture.id }, data: { statut: "PAYEE" } });
      return { facture, solde };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
  if ("erreur" in resultat) return { erreur: resultat.erreur, valeurs };

  await journaliser({
    action: "payment.recorded",
    summary: `Paiement de ${formaterMontant(montant)} reçu pour la facture ${resultat.facture.numero}${resultat.solde ? " (soldée)" : ""}`,
    entityType: "Facture",
    entityId: resultat.facture.id,
    userId: utilisateur.id,
  });
  rafraichir(resultat.facture);
  return { succes: resultat.solde ? "Paiement enregistré : facture soldée." : "Paiement enregistré." };
}

/// Correction d'une erreur de saisie. Réservé aux administrateurs.
export async function supprimerPaiement(donnees: FormData): Promise<void> {
  const utilisateur = await exigerRole("ADMIN");
  const id = String(donnees.get("id") ?? "");
  const paiement = await prisma.paiement.findUnique({ where: { id }, include: { facture: true } });
  if (!paiement || paiement.facture.statut === "ANNULEE") return;

  await prisma.$transaction([
    prisma.paiement.delete({ where: { id } }),
    prisma.facture.update({ where: { id: paiement.factureId }, data: { statut: "EMISE" } }),
  ]);
  await journaliser({
    action: "payment.deleted",
    summary: `Paiement de ${formaterMontant(paiement.montant)} supprimé sur la facture ${paiement.facture.numero}`,
    entityType: "Facture",
    entityId: paiement.factureId,
    userId: utilisateur.id,
  });
  rafraichir(paiement.facture);
}
