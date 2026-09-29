import type { Prisma } from "@prisma/client";

/// Bibliothèque (demande du client du 29/09/2026) : uniquement les documents
/// administratifs des sessions de formation — modèles de convention,
/// programmes, feuilles d'émargement… Un document rattaché à une personne
/// (apprenant, formateur) ou à une entreprise ne se voit que dans sa fiche :
/// le CV d'un formateur n'a rien à faire dans la bibliothèque. Factures et
/// preuves Qualiopi ont leurs propres écrans.
export const FILTRE_BIBLIOTHEQUE = {
  learnerId: null,
  trainerId: null,
  companyId: null,
  categorie: { notIn: ["FINANCE", "QUALIOPI"] },
} satisfies Prisma.DocumentWhereInput;

export function dansLaBibliotheque(d: { learnerId: string | null; trainerId: string | null; companyId: string | null; categorie: string }): boolean {
  return !d.learnerId && !d.trainerId && !d.companyId && d.categorie !== "FINANCE" && d.categorie !== "QUALIOPI";
}
