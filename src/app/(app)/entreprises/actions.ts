"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { normaliserCodeApe, rechercherEntreprise, type EntrepriseTrouvee } from "@/lib/annuaire-entreprises";
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
  codeApe: texteFacultatif
    .refine((valeur) => valeur === undefined || /^\d{2}\.?\d{2}[A-Za-z]$/.test(valeur.replace(/\s/g, "")), "Le code APE s'écrit 4 chiffres et une lettre, par exemple 8559A.")
    .transform((valeur) => (valeur === undefined ? undefined : normaliserCodeApe(valeur))),
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

/// Modifie une fiche entreprise existante. Un SIRET ne peut appartenir qu'à
/// une seule entreprise.
export async function modifierEntreprise(_precedent: EtatFormulaire, donnees: FormData): Promise<EtatFormulaire> {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");
  const id = String(donnees.get("id") ?? "");
  const existante = await prisma.company.findFirst({ where: { id, deletedAt: null } });
  if (!existante) return { erreur: "Entreprise introuvable." };

  const resultat = schemaEntreprise.safeParse(Object.fromEntries(donnees));
  if (!resultat.success) {
    return { erreur: resultat.error.issues[0]?.message ?? "Saisie invalide.", valeurs: saisie(donnees) };
  }
  const donneesValides = resultat.data;
  const siret = donneesValides.siret?.replace(/\s/g, "");
  if (siret) {
    const doublon = await prisma.company.findFirst({ where: { siret, deletedAt: null, id: { not: id } } });
    if (doublon) return { erreur: `Ce SIRET est déjà enregistré pour ${doublon.raisonSociale}.`, valeurs: saisie(donnees) };
  }

  // Un champ vidé dans le formulaire s'efface en base.
  const vide = (valeur: string | undefined) => valeur ?? null;
  await prisma.company.update({
    where: { id },
    data: {
      raisonSociale: donneesValides.raisonSociale,
      siret: siret ?? null,
      codeApe: vide(donneesValides.codeApe),
      adresse: vide(donneesValides.adresse),
      codePostal: vide(donneesValides.codePostal),
      ville: vide(donneesValides.ville),
      telephone: vide(donneesValides.telephone),
      email: vide(donneesValides.email),
      siteWeb: vide(donneesValides.siteWeb),
      notes: vide(donneesValides.notes),
    },
  });
  await journaliser({
    action: "company.updated",
    summary: `Entreprise modifiée : ${donneesValides.raisonSociale}`,
    entityType: "Company",
    entityId: id,
    userId: utilisateur.id,
  });
  revalidatePath("/entreprises");
  revalidatePath(`/entreprises/${id}`);
  redirect(`/entreprises/${id}`);
}

export type ResultatRecherche = { entreprise?: EntrepriseTrouvee; erreur?: string };

/// Recherche dans l'annuaire public des entreprises, depuis le formulaire,
/// pour en pré-remplir les champs à la saisie du SIRET.
export async function rechercherEntrepriseParSiret(siret: string): Promise<ResultatRecherche> {
  await exigerRole("ADMIN", "GESTIONNAIRE");
  try {
    const entreprise = await rechercherEntreprise(siret);
    if (!entreprise) return { erreur: "Aucune entreprise trouvée pour ce numéro dans l'annuaire des entreprises." };
    return { entreprise };
  } catch (erreur) {
    return { erreur: erreur instanceof Error ? erreur.message : "Recherche impossible pour le moment." };
  }
}
