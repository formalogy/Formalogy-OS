"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { journaliser } from "@/lib/journal";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";

/// `valeurs` renvoie la saisie telle qu'elle a été soumise : sans elle, une
/// erreur de validation viderait le formulaire et l'utilisateur devrait tout
/// retaper.
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

/// Transforme une valeur de formulaire vide en undefined : un champ laissé
/// vide doit rester nul en base, pas devenir une chaîne vide.
const texteFacultatif = z
  .string()
  .trim()
  .transform((valeur) => (valeur === "" ? undefined : valeur))
  .optional();

const schemaEntreprise = z.object({
  raisonSociale: z.string().trim().min(1, "La raison sociale est obligatoire."),
  siret: texteFacultatif.refine(
    (valeur) => valeur === undefined || /^\d{14}$/.test(valeur.replace(/\s/g, "")),
    "Le SIRET doit comporter exactement 14 chiffres.",
  ),
  adresse: texteFacultatif,
  codePostal: texteFacultatif,
  ville: texteFacultatif,
  telephone: texteFacultatif,
  email: texteFacultatif.refine(
    (valeur) => valeur === undefined || z.email().safeParse(valeur).success,
    "L'adresse email n'est pas valide.",
  ),
  siteWeb: texteFacultatif,
  notes: texteFacultatif,
});

export async function creerEntreprise(
  _precedent: EtatFormulaire,
  donnees: FormData,
): Promise<EtatFormulaire> {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");

  const resultat = schemaEntreprise.safeParse(Object.fromEntries(donnees));
  if (!resultat.success) {
    return {
      erreur: resultat.error.issues[0]?.message ?? "Saisie invalide.",
      valeurs: saisie(donnees),
    };
  }

  const donneesValides = resultat.data;
  const siret = donneesValides.siret?.replace(/\s/g, "");

  if (siret) {
    const doublon = await prisma.company.findFirst({
      where: { siret, deletedAt: null },
    });
    if (doublon) {
      return {
        erreur: `Ce SIRET est déjà enregistré pour ${doublon.raisonSociale}.`,
        valeurs: saisie(donnees),
      };
    }
  }

  const entreprise = await prisma.company.create({
    data: { ...donneesValides, siret, createdById: utilisateur.id },
  });

  await journaliser({
    action: "company.created",
    summary: `Entreprise créée : ${entreprise.raisonSociale}`,
    entityType: "Company",
    entityId: entreprise.id,
    userId: utilisateur.id,
  });

  revalidatePath("/entreprises");
  redirect(`/entreprises/${entreprise.id}`);
}

const schemaContact = z.object({
  companyId: z.string().min(1),
  prenom: z.string().trim().min(1, "Le prénom est obligatoire."),
  nom: z.string().trim().min(1, "Le nom est obligatoire."),
  fonction: texteFacultatif,
  email: texteFacultatif.refine(
    (valeur) => valeur === undefined || z.email().safeParse(valeur).success,
    "L'adresse email n'est pas valide.",
  ),
  telephone: texteFacultatif,
});

export async function creerContact(
  _precedent: EtatFormulaire,
  donnees: FormData,
): Promise<EtatFormulaire> {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");

  const resultat = schemaContact.safeParse(Object.fromEntries(donnees));
  if (!resultat.success) {
    return {
      erreur: resultat.error.issues[0]?.message ?? "Saisie invalide.",
      valeurs: saisie(donnees),
    };
  }

  const entreprise = await prisma.company.findFirst({
    where: { id: resultat.data.companyId, deletedAt: null },
  });
  if (!entreprise) {
    return { erreur: "Entreprise introuvable.", valeurs: saisie(donnees) };
  }

  const contact = await prisma.contact.create({
    data: { ...resultat.data, createdById: utilisateur.id },
  });

  await journaliser({
    action: "contact.created",
    summary: `Contact ajouté : ${contact.prenom} ${contact.nom} — ${entreprise.raisonSociale}`,
    entityType: "Contact",
    entityId: contact.id,
    userId: utilisateur.id,
  });

  revalidatePath(`/entreprises/${entreprise.id}`);
  return {};
}
