import type { Prisma } from "@prisma/client";

/// Bibliothèque (demandes du client des 29 et 30/09/2026) : uniquement les
/// documents administratifs de référence — modèles de convention,
/// programmes… Un document produit pour une session (feuille d'émargement,
/// bilan…) se voit dans la session, et la feuille d'émargement aussi dans la
/// fiche de chaque inscrit ; un document rattaché à une personne (apprenant,
/// formateur) ou à une entreprise ne se voit que dans sa fiche : le CV d'un
/// formateur n'a rien à faire dans la bibliothèque. Factures et preuves
/// Qualiopi ont leurs propres écrans.
export const FILTRE_BIBLIOTHEQUE = {
  sessionId: null,
  learnerId: null,
  trainerId: null,
  companyId: null,
  categorie: { notIn: ["FINANCE", "QUALIOPI"] },
} satisfies Prisma.DocumentWhereInput;

export function dansLaBibliotheque(d: {
  sessionId: string | null;
  learnerId: string | null;
  trainerId: string | null;
  companyId: string | null;
  categorie: string;
}): boolean {
  return !d.sessionId && !d.learnerId && !d.trainerId && !d.companyId && d.categorie !== "FINANCE" && d.categorie !== "QUALIOPI";
}
