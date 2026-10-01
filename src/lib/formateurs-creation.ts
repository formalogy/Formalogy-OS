import "server-only";

import { z } from "zod";

/// Saisie d'une fiche formateur, partagée entre le formulaire et l'assistant IA.

const texteFacultatif = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

export const schemaFormateur = z.object({
  prenom: z.string().trim().min(1, "Le prénom est obligatoire."),
  nom: z.string().trim().min(1, "Le nom est obligatoire."),
  email: texteFacultatif.refine(
    (v) => v === undefined || z.email().safeParse(v).success,
    "L'adresse email n'est pas valide.",
  ),
  telephone: texteFacultatif,
  statut: z.enum(["INDEPENDANT", "SALARIE", "SOUS_TRAITANT"]),
  /// Façon habituelle de travailler ; vide = non précisée.
  modalite: z
    .enum(["PRESENTIEL", "DISTANCIEL", ""])
    .optional()
    .transform((v) => v || null),
  siret: texteFacultatif.refine(
    (v) => v === undefined || /^\d{14}$/.test(v.replace(/\s/g, "")),
    "Le SIRET doit comporter 14 chiffres.",
  ),
  numeroDeclaration: texteFacultatif,
  specialites: texteFacultatif,
  tauxCommissionnement: texteFacultatif.refine(
    (v) => v === undefined || /^\d{1,2}([.,]\d{1,2})?$|^100([.,]0{1,2})?$/.test(v),
    "Le taux de commissionnement doit être un pourcentage entre 0 et 100, ex. 15 ou 15,5.",
  ),
  notes: texteFacultatif,
});

export function donneesFormateur(d: z.infer<typeof schemaFormateur>) {
  return {
    prenom: d.prenom,
    nom: d.nom,
    email: d.email?.toLowerCase() ?? null,
    telephone: d.telephone ?? null,
    statut: d.statut,
    modalite: d.modalite,
    siret: d.siret?.replace(/\s/g, "") ?? null,
    numeroDeclaration: d.numeroDeclaration ?? null,
    specialites: d.specialites ?? null,
    tauxCommissionnement: d.tauxCommissionnement ? d.tauxCommissionnement.replace(",", ".") : null,
    notes: d.notes ?? null,
  };
}
