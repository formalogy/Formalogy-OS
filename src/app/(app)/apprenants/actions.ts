"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { z } from "zod";

import { LIBELLE_STATUT_APPRENANT } from "@/lib/apprenants-libelles";
import { cheminPhoto, verifierPhoto } from "@/lib/apprenants-photo";
import { declencher } from "@/lib/automatisations/moteur";
import { envoyerEmail } from "@/lib/emails/envoi";
import { journaliser } from "@/lib/journal";
import { prisma } from "@/lib/prisma";
import { anonymiserApprenant } from "@/lib/rgpd";
import { exigerRole } from "@/lib/session";
import { stockage, StockageNonConfigure } from "@/lib/stockage";

export type EtatFormulaire = {
  erreur?: string;
  valeurs?: Record<string, string>;
};

function saisie(donnees: FormData): Record<string, string> {
  const valeurs: Record<string, string> = {};
  for (const [cle, valeur] of donnees.entries()) {
    if (typeof valeur === "string") valeurs[cle] = valeur;
  }
  return valeurs;
}

function messageStockage(erreur: unknown): string {
  if (erreur instanceof StockageNonConfigure) {
    return "Le stockage des documents n'est pas encore configuré. Il manque la clé Supabase dans le fichier de configuration.";
  }
  console.error("Erreur de stockage :", erreur);
  return "Le fichier n'a pas pu être enregistré dans l'espace de stockage. Réessayez dans un instant.";
}

const texteFacultatif = z
  .string()
  .trim()
  .transform((valeur) => (valeur === "" ? undefined : valeur))
  .optional();

const STATUTS = ["PROSPECT", "INSCRIT", "EN_FORMATION", "TERMINE", "ABANDONNE"] as const;
const TYPES = ["ENTREPRISE", "OPCO", "CPF", "FRANCE_TRAVAIL", "PERSONNEL", "AUTRE"] as const;

const schemaApprenant = z.object({
  prenom: z.string().trim().min(1, "Le prénom est obligatoire."),
  nom: z.string().trim().min(1, "Le nom est obligatoire."),
  dateNaissance: texteFacultatif,
  email: texteFacultatif.refine(
    (valeur) => valeur === undefined || z.email().safeParse(valeur).success,
    "L'adresse email n'est pas valide.",
  ),
  telephone: texteFacultatif,
  adresse: texteFacultatif,
  codePostal: texteFacultatif,
  ville: texteFacultatif,
  niveauEtudes: texteFacultatif,
  companyId: texteFacultatif,
  statut: z.enum(STATUTS),
  financement: z.enum(TYPES),
  numeroDossierCpf: texteFacultatif,
  numeroOffreCpf: texteFacultatif,
  notes: texteFacultatif,
});

export async function creerApprenant(
  _precedent: EtatFormulaire,
  donnees: FormData,
): Promise<EtatFormulaire> {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");

  const resultat = schemaApprenant.safeParse(Object.fromEntries(donnees));
  if (!resultat.success) {
    return {
      erreur: resultat.error.issues[0]?.message ?? "Saisie invalide.",
      valeurs: saisie(donnees),
    };
  }

  const { dateNaissance, companyId, ...reste } = resultat.data;

  const apprenant = await prisma.learner.create({
    data: {
      ...reste,
      dateNaissance: dateNaissance ? new Date(dateNaissance) : null,
      companyId: companyId ?? null,
      createdById: utilisateur.id,
    },
    include: { company: { select: { raisonSociale: true } } },
  });

  await journaliser({
    action: "learner.created",
    summary: `Apprenant créé : ${apprenant.prenom} ${apprenant.nom}${
      apprenant.company ? ` — ${apprenant.company.raisonSociale}` : ""
    }`,
    entityType: "Learner",
    entityId: apprenant.id,
    userId: utilisateur.id,
  });

  // Exécutées après la réponse : l'envoi d'un email ne fait pas attendre l'écran.
  after(() => declencher({ type: "APPRENANT_CREE", learnerId: apprenant.id }));

  revalidatePath("/apprenants");
  redirect(`/apprenants/${apprenant.id}/inscrire-session?nouveau`);
}

export async function modifierApprenant(
  _precedent: EtatFormulaire,
  donnees: FormData,
): Promise<EtatFormulaire> {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");

  const id = String(donnees.get("id") ?? "");
  const existant = await prisma.learner.findFirst({ where: { id, deletedAt: null } });
  if (!existant) return { erreur: "Apprenant introuvable.", valeurs: saisie(donnees) };

  const resultat = schemaApprenant.safeParse(Object.fromEntries(donnees));
  if (!resultat.success) {
    return {
      erreur: resultat.error.issues[0]?.message ?? "Saisie invalide.",
      valeurs: saisie(donnees),
    };
  }

  const { dateNaissance, companyId, ...reste } = resultat.data;

  const apprenant = await prisma.learner.update({
    where: { id },
    data: {
      ...reste,
      dateNaissance: dateNaissance ? new Date(dateNaissance) : null,
      companyId: companyId ?? null,
    },
  });

  await journaliser({
    action: "learner.updated",
    summary: `Fiche apprenant modifiée : ${apprenant.prenom} ${apprenant.nom}`,
    entityType: "Learner",
    entityId: apprenant.id,
    userId: utilisateur.id,
  });

  revalidatePath("/apprenants");
  revalidatePath(`/apprenants/${apprenant.id}`);
  redirect(`/apprenants/${apprenant.id}`);
}

export async function changerStatutApprenant(donnees: FormData): Promise<void> {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");

  const schema = z.object({ id: z.string().min(1), statut: z.enum(STATUTS) });
  const resultat = schema.safeParse(Object.fromEntries(donnees));
  if (!resultat.success) return;

  const apprenant = await prisma.learner.update({
    where: { id: resultat.data.id },
    data: { statut: resultat.data.statut },
  });

  await journaliser({
    action: "learner.status_changed",
    summary: `${apprenant.prenom} ${apprenant.nom} — statut passé à « ${
      LIBELLE_STATUT_APPRENANT[resultat.data.statut]
    } »`,
    entityType: "Learner",
    entityId: apprenant.id,
    userId: utilisateur.id,
  });

  revalidatePath("/apprenants");
  revalidatePath(`/apprenants/${apprenant.id}`);
}

export type EtatEnvoi = { erreur?: string; succes?: string };

export async function envoyerEmailApprenant(_precedent: EtatEnvoi, donnees: FormData): Promise<EtatEnvoi> {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");

  const r = z
    .object({
      learnerId: z.string().min(1),
      templateId: z.string().optional(),
      sujet: z.string().trim().min(1, "Le sujet est obligatoire.").max(200, "Le sujet est trop long."),
      corps: z.string().trim().min(1, "Le message est vide."),
    })
    .safeParse(Object.fromEntries(donnees));
  if (!r.success) return { erreur: r.error.issues[0]?.message ?? "Saisie invalide." };

  const apprenant = await prisma.learner.findFirst({ where: { id: r.data.learnerId, deletedAt: null } });
  if (!apprenant) return { erreur: "Apprenant introuvable." };
  // L'adresse est relue en base : on n'envoie jamais à une adresse transmise
  // par le navigateur.
  if (!apprenant.email) return { erreur: "Cet apprenant n'a pas d'adresse email." };

  const templateId = r.data.templateId || undefined;
  if (templateId && !(await prisma.emailTemplate.findUnique({ where: { id: templateId } }))) {
    return { erreur: "Modèle introuvable." };
  }

  const email = await envoyerEmail({
    destinataire: apprenant.email,
    sujet: r.data.sujet,
    corps: r.data.corps,
    templateId,
    learnerId: apprenant.id,
    companyId: apprenant.companyId ?? undefined,
    createdById: utilisateur.id,
  });

  await journaliser({
    action: email.statut === "ECHEC" ? "email.failed" : "email.sent",
    summary: `Email « ${email.sujet} » ${email.statut === "SIMULE" ? "simulé" : email.statut === "ECHEC" ? "en échec" : "envoyé"} — ${apprenant.prenom} ${apprenant.nom}`,
    entityType: "Email",
    entityId: email.id,
    userId: utilisateur.id,
  });

  revalidatePath(`/apprenants/${apprenant.id}`);
  if (email.statut === "ECHEC") return { erreur: `L'email n'est pas parti : ${email.erreur}` };
  return { succes: email.statut === "SIMULE" ? "Email enregistré (simulation)." : "Email envoyé." };
}

/// Droit à l'effacement (RGPD). Réservé aux administrateurs : irréversible,
/// et redirige vers la liste puisque la fiche masque désormais l'apprenant.
export async function anonymiserFicheApprenant(donnees: FormData): Promise<{ erreur?: string }> {
  const admin = await exigerRole("ADMIN");
  const id = String(donnees.get("id") ?? "");

  const apprenant = await prisma.learner.findUnique({ where: { id } });
  if (!apprenant) return { erreur: "Apprenant introuvable." };

  const r = await anonymiserApprenant(id);
  if (r.erreur) return r;

  await journaliser({
    action: "learner.anonymized",
    summary: `Fiche apprenant anonymisée (droit à l'effacement RGPD), référence ${id.slice(0, 8)}`,
    entityType: "Learner",
    entityId: id,
    userId: admin.id,
  });

  redirect("/apprenants");
}

/// Dépose (ou remplace) la photo de profil d'un apprenant.
export async function deposerPhotoApprenant(_precedent: EtatFormulaire, donnees: FormData): Promise<EtatFormulaire> {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");
  const id = String(donnees.get("id") ?? "");

  const apprenant = await prisma.learner.findFirst({ where: { id, deletedAt: null } });
  if (!apprenant) return { erreur: "Apprenant introuvable." };

  const photo = await verifierPhoto(donnees.get("fichier"));
  if (typeof photo === "string") return { erreur: photo };

  const chemin = cheminPhoto(apprenant.id, photo.extension);
  try {
    await stockage().deposer(chemin, photo.octets, photo.typeMime);
  } catch (erreur) {
    return { erreur: messageStockage(erreur) };
  }

  await prisma.learner.update({ where: { id: apprenant.id }, data: { photoCheminStockage: chemin } });

  // L'ancienne photo est retirée après coup : un échec ici n'annule pas le
  // remplacement, déjà effectif en base.
  if (apprenant.photoCheminStockage) {
    await stockage().supprimer([apprenant.photoCheminStockage]).catch(() => undefined);
  }

  await journaliser({
    action: "learner.photo_updated",
    summary: `Photo de profil mise à jour : ${apprenant.prenom} ${apprenant.nom}`,
    entityType: "Learner",
    entityId: apprenant.id,
    userId: utilisateur.id,
  });

  revalidatePath("/apprenants");
  revalidatePath(`/apprenants/${apprenant.id}`);
  return {};
}

/// Retire la photo de profil, sans remplacement.
export async function retirerPhotoApprenant(donnees: FormData): Promise<void> {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");
  const id = String(donnees.get("id") ?? "");

  const apprenant = await prisma.learner.findFirst({ where: { id, deletedAt: null } });
  if (!apprenant?.photoCheminStockage) return;

  await prisma.learner.update({ where: { id: apprenant.id }, data: { photoCheminStockage: null } });
  await stockage().supprimer([apprenant.photoCheminStockage]).catch(() => undefined);

  await journaliser({
    action: "learner.photo_removed",
    summary: `Photo de profil retirée : ${apprenant.prenom} ${apprenant.nom}`,
    entityType: "Learner",
    entityId: apprenant.id,
    userId: utilisateur.id,
  });

  revalidatePath("/apprenants");
  revalidatePath(`/apprenants/${apprenant.id}`);
}
