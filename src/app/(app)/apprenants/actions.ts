"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { z } from "zod";

import { LIBELLE_STATUT_APPRENANT } from "@/lib/apprenants-libelles";
import { declencher } from "@/lib/automatisations/moteur";
import { envoyerEmail } from "@/lib/emails/envoi";
import { journaliser } from "@/lib/journal";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";

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
  companyId: texteFacultatif,
  statut: z.enum(STATUTS),
  financement: z.enum(TYPES),
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
