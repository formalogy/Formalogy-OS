"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { journaliser } from "@/lib/journal";
import { LIBELLE_STATUT } from "@/lib/crm-libelles";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";

/// `valeurs` renvoie la saisie telle qu'elle a été soumise : sans elle, une
/// erreur de validation viderait le formulaire.
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

const STATUTS = [
  "NOUVEAU",
  "A_CONTACTER",
  "CONTACTE",
  "RELANCE",
  "PROPOSITION_ENVOYEE",
  "NEGOCIATION",
  "GAGNE",
  "PERDU",
] as const;

const SOURCES = [
  "SITE_INTERNET",
  "CPF",
  "RECOMMANDATION",
  "PROSPECTION",
  "EMAIL",
  "TELEPHONE",
  "PARTENAIRE",
  "AUTRE",
] as const;

const schemaProspect = z.object({
  prenom: z.string().trim().min(1, "Le prénom est obligatoire."),
  nom: z.string().trim().min(1, "Le nom est obligatoire."),
  entreprise: texteFacultatif,
  email: texteFacultatif.refine(
    (valeur) => valeur === undefined || z.email().safeParse(valeur).success,
    "L'adresse email n'est pas valide.",
  ),
  telephone: texteFacultatif,
  source: z.enum(SOURCES),
  statut: z.enum(STATUTS),
  montantPotentiel: texteFacultatif.refine(
    (valeur) => valeur === undefined || !Number.isNaN(Number(valeur.replace(",", "."))),
    "Le montant doit être un nombre.",
  ),
  prochaineRelance: texteFacultatif,
  notes: texteFacultatif,
});

export async function creerProspect(
  _precedent: EtatFormulaire,
  donnees: FormData,
): Promise<EtatFormulaire> {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");

  const resultat = schemaProspect.safeParse(Object.fromEntries(donnees));
  if (!resultat.success) {
    return {
      erreur: resultat.error.issues[0]?.message ?? "Saisie invalide.",
      valeurs: saisie(donnees),
    };
  }

  const { montantPotentiel, prochaineRelance, ...reste } = resultat.data;

  const prospect = await prisma.prospect.create({
    data: {
      ...reste,
      montantPotentiel: montantPotentiel
        ? Number(montantPotentiel.replace(",", "."))
        : null,
      prochaineRelanceAt: prochaineRelance ? new Date(prochaineRelance) : null,
      commercialId: utilisateur.id,
      createdById: utilisateur.id,
    },
  });

  await journaliser({
    action: "prospect.created",
    summary: `Prospect créé : ${prospect.prenom} ${prospect.nom}${
      prospect.entreprise ? ` — ${prospect.entreprise}` : ""
    }`,
    entityType: "Prospect",
    entityId: prospect.id,
    userId: utilisateur.id,
  });

  revalidatePath("/crm");
  redirect("/crm");
}

export async function changerStatutProspect(donnees: FormData): Promise<void> {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");

  const schema = z.object({
    id: z.string().min(1),
    statut: z.enum(STATUTS),
  });

  const resultat = schema.safeParse(Object.fromEntries(donnees));
  if (!resultat.success) return;

  const prospect = await prisma.prospect.update({
    where: { id: resultat.data.id },
    data: {
      statut: resultat.data.statut,
      derniereInteractionAt: new Date(),
    },
  });

  await journaliser({
    action: "prospect.status_changed",
    summary: `${prospect.prenom} ${prospect.nom} — statut passé à « ${
      LIBELLE_STATUT[resultat.data.statut]
    } »`,
    entityType: "Prospect",
    entityId: prospect.id,
    userId: utilisateur.id,
  });

  revalidatePath("/crm");
}
