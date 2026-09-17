"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { enCentimes, formaterMontant, lireMontant } from "@/lib/factures";
import { TYPES_FINANCEUR } from "@/lib/financements";
import { journaliser } from "@/lib/journal";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";
import { aujourdhuiUTC, jourDepuisSaisie } from "@/lib/sessions-libelles";

export type EtatFormulaire = { erreur?: string; succes?: string; valeurs?: Record<string, string> };

function saisie(donnees: FormData): Record<string, string> {
  return Object.fromEntries([...donnees.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;
}

function rafraichir(dossier: { id: string; sessionId: string | null }) {
  revalidatePath("/financements");
  revalidatePath(`/financements/${dossier.id}`);
  if (dossier.sessionId) revalidatePath(`/sessions/${dossier.sessionId}`);
}

const texteFacultatif = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

const schema = z.object({
  financeurType: z.enum(TYPES_FINANCEUR as [string, ...string[]]),
  financeurNom: z.string().trim().min(1, "Indiquez le nom du financeur."),
  reference: texteFacultatif,
  sessionId: texteFacultatif,
  learnerId: texteFacultatif,
  companyId: texteFacultatif,
  montantDemande: texteFacultatif,
  dateLimite: texteFacultatif,
  subrogation: z.enum(["on"]).optional(),
  notes: texteFacultatif,
});

async function lireDossier(donnees: FormData) {
  const r = schema.safeParse(saisie(donnees));
  if (!r.success) return { erreur: r.error.issues[0]?.message ?? "Saisie invalide." } as const;

  let montantDemande: string | null = null;
  if (r.data.montantDemande) {
    const m = lireMontant(r.data.montantDemande);
    if (!m || enCentimes(m) <= 0) return { erreur: "Le montant demandé doit être positif, ex. 1250 ou 1250,50." } as const;
    montantDemande = m;
  }
  let dateLimite: Date | null = null;
  if (r.data.dateLimite) {
    dateLimite = jourDepuisSaisie(r.data.dateLimite);
    if (!dateLimite) return { erreur: "Date limite invalide." } as const;
  }

  const [session, apprenant, entreprise] = await Promise.all([
    r.data.sessionId ? prisma.trainingSession.findFirst({ where: { id: r.data.sessionId, deletedAt: null } }) : null,
    r.data.learnerId ? prisma.learner.findFirst({ where: { id: r.data.learnerId, deletedAt: null } }) : null,
    r.data.companyId ? prisma.company.findFirst({ where: { id: r.data.companyId, deletedAt: null } }) : null,
  ]);
  if ((r.data.sessionId && !session) || (r.data.learnerId && !apprenant) || (r.data.companyId && !entreprise)) {
    return { erreur: "Un des éléments rattachés n'existe plus. Rechargez la page." } as const;
  }

  return {
    data: {
      financeurType: r.data.financeurType as never,
      financeurNom: r.data.financeurNom,
      reference: r.data.reference ?? null,
      sessionId: r.data.sessionId ?? null,
      learnerId: r.data.learnerId ?? null,
      companyId: r.data.companyId ?? null,
      montantDemande,
      dateLimite,
      subrogation: r.data.subrogation === "on",
      notes: r.data.notes ?? null,
    },
  } as const;
}

export async function creerDossier(_precedent: EtatFormulaire, donnees: FormData): Promise<EtatFormulaire> {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");
  const l = await lireDossier(donnees);
  if ("erreur" in l) return { erreur: l.erreur, valeurs: saisie(donnees) };

  const dossier = await prisma.dossierFinancement.create({ data: { ...l.data, createdById: utilisateur.id } });
  await journaliser({
    action: "funding.created",
    summary: `Dossier de financement créé : ${dossier.financeurNom}${dossier.montantDemande ? ` — ${formaterMontant(dossier.montantDemande)} demandés` : ""}`,
    entityType: "DossierFinancement",
    entityId: dossier.id,
    userId: utilisateur.id,
  });
  rafraichir(dossier);
  redirect(`/financements/${dossier.id}`);
}

export async function modifierDossier(_precedent: EtatFormulaire, donnees: FormData): Promise<EtatFormulaire> {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");
  const id = String(donnees.get("id") ?? "");
  const existant = await prisma.dossierFinancement.findUnique({ where: { id } });
  if (!existant) return { erreur: "Dossier introuvable." };

  const l = await lireDossier(donnees);
  if ("erreur" in l) return { erreur: l.erreur, valeurs: saisie(donnees) };

  await prisma.dossierFinancement.update({ where: { id }, data: l.data });
  await journaliser({
    action: "funding.updated",
    summary: `Dossier de financement modifié : ${l.data.financeurNom}`,
    entityType: "DossierFinancement",
    entityId: id,
    userId: utilisateur.id,
  });
  rafraichir(existant);
  redirect(`/financements/${id}`);
}

/// Avancement du dossier : dépôt, accord, refus, annulation. Chaque étape
/// demande ce qui la justifie (date, montant accordé, motif de refus).
export async function changerStatutDossier(_precedent: EtatFormulaire, donnees: FormData): Promise<EtatFormulaire> {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");
  const valeurs = saisie(donnees);
  const id = valeurs.id ?? "";
  const dossier = await prisma.dossierFinancement.findUnique({ where: { id } });
  if (!dossier) return { erreur: "Dossier introuvable." };

  const statut = z.enum(["DEPOSE", "ACCORDE", "REFUSE", "ANNULE", "A_MONTER"]).safeParse(valeurs.statut);
  if (!statut.success) return { erreur: "Statut invalide.", valeurs };

  const aujourdhui = aujourdhuiUTC();
  const data: Record<string, unknown> = { statut: statut.data };

  if (statut.data === "DEPOSE") {
    const date = jourDepuisSaisie(valeurs.dateDepot ?? "");
    if (!date) return { erreur: "Indiquez la date de dépôt.", valeurs };
    if (date > aujourdhui) return { erreur: "La date de dépôt ne peut pas être dans le futur.", valeurs };
    data.dateDepot = date;
    data.dateReponse = null;
    data.motifRefus = null;
  }

  if (statut.data === "ACCORDE" || statut.data === "REFUSE") {
    const date = jourDepuisSaisie(valeurs.dateReponse ?? "");
    if (!date) return { erreur: "Indiquez la date de la réponse.", valeurs };
    if (date > aujourdhui) return { erreur: "La date de réponse ne peut pas être dans le futur.", valeurs };
    if (dossier.dateDepot && date < dossier.dateDepot) return { erreur: "La réponse ne peut pas précéder le dépôt.", valeurs };
    data.dateReponse = date;

    if (statut.data === "ACCORDE") {
      const montant = lireMontant(valeurs.montantAccorde ?? "");
      if (!montant || enCentimes(montant) <= 0) return { erreur: "Indiquez le montant accordé.", valeurs };
      data.montantAccorde = montant;
      data.motifRefus = null;
    } else {
      const motif = (valeurs.motifRefus ?? "").trim();
      if (!motif) return { erreur: "Indiquez le motif du refus : il servira pour un nouveau dossier.", valeurs };
      data.motifRefus = motif.slice(0, 500);
      data.montantAccorde = null;
    }
  }

  if (statut.data === "A_MONTER") {
    data.dateDepot = null;
    data.dateReponse = null;
    data.montantAccorde = null;
    data.motifRefus = null;
  }

  await prisma.dossierFinancement.update({ where: { id }, data });

  const libelle = {
    A_MONTER: "remis à déposer",
    DEPOSE: "déposé",
    ACCORDE: `accordé (${data.montantAccorde ? formaterMontant(data.montantAccorde) : ""})`,
    REFUSE: "refusé",
    ANNULE: "annulé",
  }[statut.data];
  await journaliser({
    action: "funding.status_changed",
    summary: `Dossier ${dossier.financeurNom}${dossier.reference ? ` (${dossier.reference})` : ""} ${libelle}`,
    entityType: "DossierFinancement",
    entityId: id,
    userId: utilisateur.id,
  });
  rafraichir(dossier);
  return { succes: "Enregistré." };
}

/// Suppression réservée aux administrateurs, et seulement tant que le dossier
/// n'a pas été déposé : ensuite il fait partie de l'historique.
export async function supprimerDossier(donnees: FormData): Promise<void> {
  const utilisateur = await exigerRole("ADMIN");
  const id = String(donnees.get("id") ?? "");
  const dossier = await prisma.dossierFinancement.findUnique({ where: { id } });
  if (!dossier || dossier.statut !== "A_MONTER") return;

  await prisma.dossierFinancement.delete({ where: { id } });
  await journaliser({
    action: "funding.deleted",
    summary: `Dossier de financement supprimé : ${dossier.financeurNom}`,
    entityType: "DossierFinancement",
    entityId: id,
    userId: utilisateur.id,
  });
  rafraichir(dossier);
  redirect("/financements");
}
