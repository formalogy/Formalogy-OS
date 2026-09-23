"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { assainirTexteFormation } from "@/lib/formations-assainir";
import { journaliser } from "@/lib/journal";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";

const euros = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const prixLisible = (prix: number | null) => (prix === null ? "—" : euros.format(prix));

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

/// Nombre saisi à la française (« 10,5 ») ou vide.
const nombreFacultatif = (message: string) =>
  texteFacultatif
    .refine((valeur) => {
      if (valeur === undefined) return true;
      const n = Number(valeur.replace(/\s/g, "").replace(",", "."));
      return !Number.isNaN(n) && n >= 0;
    }, message)
    .transform((valeur) =>
      valeur === undefined ? null : Number(valeur.replace(/\s/g, "").replace(",", ".")),
    );

const schemaFormation = z.object({
  titre: z.string().trim().min(1, "Le titre est obligatoire."),
  reference: z
    .string()
    .trim()
    .min(1, "La référence est obligatoire.")
    .transform((valeur) => valeur.toUpperCase()),
  categoryId: texteFacultatif,
  modalite: z.enum(["PRESENTIEL", "DISTANCIEL", "E_LEARNING", "HYBRIDE"]),
  statut: z.enum(["BROUILLON", "ACTIVE", "ARCHIVEE"]),
  dureeHeures: nombreFacultatif("La durée en heures doit être un nombre positif."),
  dureeJours: nombreFacultatif("La durée en jours doit être un nombre positif."),
  prixHT: nombreFacultatif("Le prix doit être un nombre positif."),
  description: texteFacultatif,
  objectifs: texteFacultatif,
  programme: texteFacultatif,
  prerequis: texteFacultatif,
  publicVise: texteFacultatif,
  competences: texteFacultatif,
  certification: texteFacultatif,
});

/// Champs saisis via l'éditeur enrichi : leur HTML est nettoyé avant d'être
/// enregistré, jamais fait confiance tel quel.
const CHAMPS_RICHES = ["description", "objectifs", "programme", "prerequis", "publicVise", "competences"] as const;

function assainirChampsRiches<T extends Record<string, unknown>>(donnees: T): T {
  const copie: Record<string, unknown> = { ...donnees };
  for (const champ of CHAMPS_RICHES) {
    if (typeof copie[champ] === "string") copie[champ] = assainirTexteFormation(copie[champ]);
  }
  return copie as T;
}

async function referenceDejaPrise(reference: string, saufId?: string) {
  const existante = await prisma.formation.findFirst({
    where: { reference, ...(saufId ? { NOT: { id: saufId } } : {}) },
    select: { titre: true },
  });
  return existante;
}

export async function creerFormation(
  _precedent: EtatFormulaire,
  donnees: FormData,
): Promise<EtatFormulaire> {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");

  const resultat = schemaFormation.safeParse(Object.fromEntries(donnees));
  if (!resultat.success) {
    return {
      erreur: resultat.error.issues[0]?.message ?? "Saisie invalide.",
      valeurs: saisie(donnees),
    };
  }

  const doublon = await referenceDejaPrise(resultat.data.reference);
  if (doublon) {
    return {
      erreur: `La référence ${resultat.data.reference} est déjà utilisée par « ${doublon.titre} ».`,
      valeurs: saisie(donnees),
    };
  }

  const { categoryId, ...reste } = assainirChampsRiches(resultat.data);
  const formation = await prisma.formation.create({
    data: { ...reste, categoryId: categoryId ?? null, createdById: utilisateur.id },
  });

  await journaliser({
    action: "formation.created",
    summary: `Formation ajoutée au catalogue : ${formation.titre} (${formation.reference})`,
    entityType: "Formation",
    entityId: formation.id,
    userId: utilisateur.id,
  });

  revalidatePath("/formations");
  redirect(`/formations/${formation.id}`);
}

export async function modifierFormation(
  _precedent: EtatFormulaire,
  donnees: FormData,
): Promise<EtatFormulaire> {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");

  const id = String(donnees.get("id") ?? "");
  const existante = await prisma.formation.findFirst({ where: { id, deletedAt: null } });
  if (!existante) {
    return { erreur: "Formation introuvable.", valeurs: saisie(donnees) };
  }

  const resultat = schemaFormation.safeParse(Object.fromEntries(donnees));
  if (!resultat.success) {
    return {
      erreur: resultat.error.issues[0]?.message ?? "Saisie invalide.",
      valeurs: saisie(donnees),
    };
  }

  const doublon = await referenceDejaPrise(resultat.data.reference, id);
  if (doublon) {
    return {
      erreur: `La référence ${resultat.data.reference} est déjà utilisée par « ${doublon.titre} ».`,
      valeurs: saisie(donnees),
    };
  }

  const { categoryId, ...reste } = assainirChampsRiches(resultat.data);
  const formation = await prisma.formation.update({
    where: { id },
    data: { ...reste, categoryId: categoryId ?? null },
  });

  // Le prix est l'information la plus sensible du catalogue : on garde la
  // trace de l'ancienne et de la nouvelle valeur.
  const ancienPrix = existante.prixHT === null ? null : Number(existante.prixHT);
  const nouveauPrix = formation.prixHT === null ? null : Number(formation.prixHT);

  await journaliser({
    action: "formation.updated",
    summary:
      ancienPrix !== nouveauPrix
        ? `Formation modifiée : ${formation.titre} — prix HT ${prixLisible(ancienPrix)} → ${prixLisible(nouveauPrix)}`
        : `Formation modifiée : ${formation.titre}`,
    entityType: "Formation",
    entityId: formation.id,
    userId: utilisateur.id,
    metadata: { ancienPrix, nouveauPrix },
  });

  revalidatePath("/formations");
  revalidatePath(`/formations/${id}`);
  redirect(`/formations/${id}`);
}
