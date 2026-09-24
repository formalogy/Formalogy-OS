"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { executerPlanifiees, lireRegle } from "@/lib/automatisations/moteur";
import { variablesInconnues } from "@/lib/emails/modeles";
import { journaliser } from "@/lib/journal";
import { cheminSignature, verifierSignature } from "@/lib/organisme-signature";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";
import { stockage } from "@/lib/stockage";
import { jourDepuisSaisie } from "@/lib/sessions-libelles";

export type EtatFormulaire = { erreur?: string; succes?: string; valeurs?: Record<string, string> };

// ---------------------------------------------------------------------------
// Modèles d'emails — modification réservée aux administrateurs
// ---------------------------------------------------------------------------

const schemaModele = z.object({
  id: z.string().min(1),
  nom: z.string().trim().min(1, "Le nom est obligatoire."),
  description: z.string().trim().optional(),
  sujet: z.string().trim().min(1, "Le sujet est obligatoire.").max(200, "Le sujet est trop long (200 caractères maximum)."),
  corps: z.string().trim().min(1, "Le message est obligatoire."),
  actif: z.enum(["on"]).optional(),
});

export async function modifierModele(_precedent: EtatFormulaire, donnees: FormData): Promise<EtatFormulaire> {
  const utilisateur = await exigerRole("ADMIN");
  const valeurs = Object.fromEntries([...donnees.entries()].map(([k, v]) => [k, String(v)]));

  const r = schemaModele.safeParse(valeurs);
  if (!r.success) return { erreur: r.error.issues[0]?.message ?? "Saisie invalide.", valeurs };

  // Une variable mal orthographiée resterait telle quelle dans l'email reçu :
  // on la bloque avant qu'elle ne parte.
  const inconnues = variablesInconnues(`${r.data.sujet}\n${r.data.corps}`);
  if (inconnues.length) {
    return {
      erreur: `Variable inconnue : ${inconnues.map((v) => `{{${v}}}`).join(", ")}. Consultez la liste des variables disponibles.`,
      valeurs,
    };
  }

  const modele = await prisma.emailTemplate.update({
    where: { id: r.data.id },
    data: {
      nom: r.data.nom,
      description: r.data.description || null,
      sujet: r.data.sujet,
      corps: r.data.corps,
      actif: r.data.actif === "on",
    },
  });

  await journaliser({
    action: "email_template.updated",
    summary: `Modèle d'email modifié : ${modele.nom}`,
    entityType: "EmailTemplate",
    entityId: modele.id,
    userId: utilisateur.id,
  });

  revalidatePath("/parametres/modeles-emails");
  return { succes: "Modèle enregistré." };
}

// ---------------------------------------------------------------------------
// Automatisations — réservées aux administrateurs
// ---------------------------------------------------------------------------

export async function basculerAutomatisation(_precedent: EtatFormulaire, donnees: FormData): Promise<EtatFormulaire> {
  const utilisateur = await exigerRole("ADMIN");
  const id = String(donnees.get("id") ?? "");
  const automation = await prisma.automation.findUnique({ where: { id } });
  if (!automation) return { erreur: "Automatisation introuvable." };

  // On refuse d'activer une règle mal formée ou dont un modèle manque : mieux
  // vaut un refus visible maintenant qu'un échec silencieux plus tard.
  if (!automation.actif) {
    let actions;
    try {
      actions = lireRegle(automation).actions;
    } catch {
      return { erreur: "Cette règle est mal formée et ne peut pas être activée." };
    }
    for (const action of actions) {
      if (action.type === "EMAIL") {
        const modele = await prisma.emailTemplate.findUnique({ where: { code: action.modele } });
        if (!modele?.actif) {
          return { erreur: `Le modèle d'email « ${action.modele} » est absent ou désactivé : activez-le d'abord.` };
        }
      }
    }
  }

  // Chaque allumage réhorodate l'automatisation : elle ne vaut que pour la
  // suite, jamais pour des sessions dont l'échéance est déjà passée.
  const misAJour = await prisma.automation.update({
    where: { id },
    data: { actif: !automation.actif, ...(automation.actif ? {} : { activeeAt: new Date() }) },
  });
  await journaliser({
    action: misAJour.actif ? "automation.enabled" : "automation.disabled",
    summary: `Automatisation « ${misAJour.nom} » ${misAJour.actif ? "activée" : "désactivée"}`,
    entityType: "Automation",
    entityId: misAJour.id,
    userId: utilisateur.id,
  });
  revalidatePath("/parametres/automatisations");
  return {};
}

export async function modifierDelai(donnees: FormData): Promise<void> {
  await exigerRole("ADMIN");
  const r = z
    .object({ id: z.string().min(1), jours: z.coerce.number().int().min(0).max(60) })
    .safeParse(Object.fromEntries(donnees));
  if (!r.success) return;

  const DECLENCHEURS_A_DELAI = ["SESSION_AVANT_DEBUT", "SESSION_AVANT_FIN", "SESSION_APRES_FIN"];
  const automation = await prisma.automation.findUnique({ where: { id: r.data.id } });
  if (!automation || !DECLENCHEURS_A_DELAI.includes(automation.declencheur)) return;

  await prisma.automation.update({
    where: { id: r.data.id },
    data: { parametres: { ...(automation.parametres as object), jours: r.data.jours } },
  });
  revalidatePath("/parametres/automatisations");
}

export async function lancerAutomatisations(_precedent: EtatFormulaire): Promise<EtatFormulaire> {
  const utilisateur = await exigerRole("ADMIN");
  const bilan = await executerPlanifiees();
  await journaliser({
    action: "automation.manual_run",
    summary: `Automatisations planifiées lancées manuellement : ${bilan.traites} cas traité(s)`,
    userId: utilisateur.id,
  });
  revalidatePath("/parametres/automatisations");
  return {
    succes:
      bilan.traites === 0
        ? "Aucun nouveau cas à traiter."
        : `${bilan.traites} cas traité${bilan.traites > 1 ? "s" : ""}.`,
  };
}

// ---------------------------------------------------------------------------
// Organisme — informations légales, modification réservée aux administrateurs
// ---------------------------------------------------------------------------

const facultatif = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v));

const schemaOrganisme = z.object({
  raisonSociale: z.string().trim().min(1, "La raison sociale est obligatoire."),
  siret: facultatif.refine((v) => v === null || /^\d{14}$/.test(v.replace(/\s/g, "")), "Le SIRET doit comporter 14 chiffres."),
  numeroDeclaration: facultatif.refine((v) => v === null || /^\d{11}$/.test(v.replace(/\s/g, "")), "Le numéro de déclaration d'activité comporte 11 chiffres."),
  adresse: facultatif,
  codePostal: facultatif.refine((v) => v === null || /^\d{5}$/.test(v), "Le code postal doit comporter 5 chiffres."),
  ville: facultatif,
  telephone: facultatif,
  email: facultatif.refine((v) => v === null || z.email().safeParse(v).success, "L'adresse email n'est pas valide."),
  siteWeb: facultatif,
  representantNom: facultatif,
  representantFonction: facultatif,
  referentHandicapNom: facultatif,
  referentHandicapEmail: facultatif,
  referentHandicapTelephone: facultatif,
  referentAdministratifNom: facultatif,
  referentAdministratifEmail: facultatif,
  referentAdministratifTelephone: facultatif,
  referentRgpdNom: facultatif,
  referentRgpdEmail: facultatif,
  qualiopiCertificateur: facultatif,
  qualiopiObtentionAt: facultatif,
  qualiopiExpireAt: facultatif,
  qualiopiProchainAuditAt: facultatif,
});

/// Dates de la certification Qualiopi, saisies au format jour.
function jourOuNull(valeur: string | null, libelle: string): Date | null | string {
  if (!valeur) return null;
  const jour = jourDepuisSaisie(valeur);
  return jour ?? `${libelle} : date invalide.`;
}

export async function modifierOrganisme(_precedent: EtatFormulaire, donnees: FormData): Promise<EtatFormulaire> {
  const utilisateur = await exigerRole("ADMIN");
  const valeurs = Object.fromEntries([...donnees.entries()].map(([k, v]) => [k, String(v)]));

  const r = schemaOrganisme.safeParse(valeurs);
  if (!r.success) return { erreur: r.error.issues[0]?.message ?? "Saisie invalide.", valeurs };

  const dates = {
    qualiopiObtentionAt: jourOuNull(r.data.qualiopiObtentionAt, "Date d'obtention"),
    qualiopiExpireAt: jourOuNull(r.data.qualiopiExpireAt, "Date de fin de validité"),
    qualiopiProchainAuditAt: jourOuNull(r.data.qualiopiProchainAuditAt, "Date du prochain audit"),
  };
  for (const valeur of Object.values(dates)) {
    if (typeof valeur === "string") return { erreur: valeur, valeurs };
  }

  const data = {
    ...r.data,
    ...(dates as { qualiopiObtentionAt: Date | null; qualiopiExpireAt: Date | null; qualiopiProchainAuditAt: Date | null }),
    siret: r.data.siret?.replace(/\s/g, "") ?? null,
    numeroDeclaration: r.data.numeroDeclaration?.replace(/\s/g, "") ?? null,
  };
  await prisma.organisme.upsert({ where: { id: "organisme" }, create: { id: "organisme", ...data }, update: data });

  await journaliser({
    action: "organisation.updated",
    summary: "Informations de l'organisme modifiées",
    entityType: "Organisme",
    entityId: "organisme",
    userId: utilisateur.id,
  });

  revalidatePath("/parametres/organisme");
  return { succes: "Informations enregistrées." };
}

/// Dépose (ou remplace) la signature de l'organisme.
export async function deposerSignatureOrganisme(_precedent: EtatFormulaire, donnees: FormData): Promise<EtatFormulaire> {
  const utilisateur = await exigerRole("ADMIN");

  const signature = await verifierSignature(donnees.get("fichier"));
  if (typeof signature === "string") return { erreur: signature };

  const organisme = await prisma.organisme.findFirst({ select: { signatureCheminStockage: true } });
  const chemin = cheminSignature(signature.extension);
  try {
    await stockage().deposer(chemin, signature.octets, signature.typeMime);
  } catch (erreur) {
    return { erreur: erreur instanceof Error ? erreur.message : "Dépôt impossible." };
  }

  await prisma.organisme.update({ where: { id: "organisme" }, data: { signatureCheminStockage: chemin } });

  // L'ancienne image est retirée après coup : un échec ici n'annule pas le
  // remplacement, déjà effectif en base.
  if (organisme?.signatureCheminStockage) {
    await stockage().supprimer([organisme.signatureCheminStockage]).catch(() => undefined);
  }

  await journaliser({
    action: "organisation.signature_updated",
    summary: "Signature de l'organisme mise à jour",
    entityType: "Organisme",
    userId: utilisateur.id,
  });

  revalidatePath("/parametres/organisme");
  return { succes: "Signature enregistrée." };
}

/// Retire la signature, sans remplacement.
export async function retirerSignatureOrganisme(): Promise<void> {
  const utilisateur = await exigerRole("ADMIN");
  const organisme = await prisma.organisme.findFirst({ select: { signatureCheminStockage: true } });
  if (!organisme?.signatureCheminStockage) return;

  await prisma.organisme.update({ where: { id: "organisme" }, data: { signatureCheminStockage: null } });
  await stockage().supprimer([organisme.signatureCheminStockage]).catch(() => undefined);

  await journaliser({
    action: "organisation.signature_removed",
    summary: "Signature de l'organisme retirée",
    entityType: "Organisme",
    userId: utilisateur.id,
  });

  revalidatePath("/parametres/organisme");
}
