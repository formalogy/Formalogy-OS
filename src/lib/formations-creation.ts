import "server-only";

import { z } from "zod";

import { assainirTexteFormation } from "@/lib/formations-assainir";
import { prisma } from "@/lib/prisma";

/// Saisie d'une fiche formation, partagée entre le formulaire et l'assistant
/// IA (programme PDF transformé en fiche, 01/10/2026).

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

export const schemaFormation = z.object({
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
  /// Plus saisi (client, 05/10/2026) : le tarif se donne par stagiaire.
  prixHT: nombreFacultatif("Le prix doit être un nombre positif.").optional(),
  description: texteFacultatif,
  objectifs: texteFacultatif,
  programme: texteFacultatif,
  prerequis: texteFacultatif,
  publicVise: texteFacultatif,
  competences: texteFacultatif,
  certification: texteFacultatif,
  typeCertification: z
    .enum(["AUCUNE", "RS", "RNCP", ""])
    .optional()
    .transform((v) => v || null),
  niveauCertification: texteFacultatif,
  methodes: texteFacultatif,
  evaluation: texteFacultatif,
  accessibilite: texteFacultatif,
  horaires: texteFacultatif,
  plateforme: z
    .enum(["EFORMA", "MON_PARCOURS_EN_LIGNE", ""])
    .optional()
    .transform((v) => v || null),
  dureeAccesMois: texteFacultatif
    .refine((v) => v === undefined || /^\d{1,2}$/.test(v), "La durée d'accès se donne en mois (ex. 3).")
    .transform((v) => (v === undefined ? null : Number(v))),
});

/// Formateurs habituels cochés sur la fiche formation.
export function formateursCoches(donnees: FormData): string[] {
  return [...new Set(donnees.getAll("formateurs").map(String).filter(Boolean))];
}

/// Champs saisis via l'éditeur enrichi : leur HTML est nettoyé avant d'être
/// enregistré, jamais fait confiance tel quel.
const CHAMPS_RICHES = ["description", "objectifs", "programme", "prerequis", "publicVise", "competences", "methodes", "evaluation", "accessibilite"] as const;

export function assainirChampsRiches<T extends Record<string, unknown>>(donnees: T): T {
  const copie: Record<string, unknown> = { ...donnees };
  for (const champ of CHAMPS_RICHES) {
    if (typeof copie[champ] === "string") copie[champ] = assainirTexteFormation(copie[champ]);
  }
  return copie as T;
}

export async function referenceDejaPrise(reference: string, saufId?: string) {
  const existante = await prisma.formation.findFirst({
    where: { reference, ...(saufId ? { NOT: { id: saufId } } : {}) },
    select: { titre: true },
  });
  return existante;
}
