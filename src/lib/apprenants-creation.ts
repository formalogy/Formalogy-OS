import "server-only";

import { after } from "next/server";
import { z } from "zod";

import { declencher } from "@/lib/automatisations/moteur";
import { journaliser } from "@/lib/journal";
import { prisma } from "@/lib/prisma";

/// Création d'une fiche apprenant, partagée entre le formulaire et
/// l'assistant IA (une proposition validée par l'utilisateur).

const texteFacultatif = z
  .string()
  .trim()
  .transform((valeur) => (valeur === "" ? undefined : valeur))
  .optional();

export const STATUTS_APPRENANT = ["PROSPECT", "INSCRIT", "EN_FORMATION", "TERMINE", "ABANDONNE"] as const;
const TYPES = ["ENTREPRISE", "OPCO", "CPF", "FRANCE_TRAVAIL", "PERSONNEL", "AUTRE"] as const;

export const schemaApprenant = z.object({
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
  statut: z.enum(STATUTS_APPRENANT),
  financement: z.enum(TYPES),
  numeroDossierCpf: texteFacultatif,
  notes: texteFacultatif,
});

export async function creerFicheApprenant(d: z.infer<typeof schemaApprenant>, userId: string) {
  const { dateNaissance, companyId, ...reste } = d;

  const apprenant = await prisma.learner.create({
    data: {
      ...reste,
      dateNaissance: dateNaissance ? new Date(dateNaissance) : null,
      companyId: companyId ?? null,
      createdById: userId,
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
    userId: userId,
  });

  // Exécutées après la réponse : l'envoi d'un email ne fait pas attendre l'écran.
  after(() => declencher({ type: "APPRENANT_CREE", learnerId: apprenant.id }));

  return apprenant;
}
