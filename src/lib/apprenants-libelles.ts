import type { StatutApprenant, TypeFinancement } from "@prisma/client";

export const STATUTS_APPRENANT: StatutApprenant[] = [
  "PROSPECT",
  "INSCRIT",
  "EN_FORMATION",
  "TERMINE",
  "ABANDONNE",
];

export const LIBELLE_STATUT_APPRENANT: Record<StatutApprenant, string> = {
  PROSPECT: "Prospect",
  INSCRIT: "Inscrit",
  EN_FORMATION: "En formation",
  TERMINE: "Terminé",
  ABANDONNE: "Abandon",
};

export const TON_STATUT_APPRENANT: Record<StatutApprenant, string> = {
  PROSPECT: "bg-surface-creuse text-texte-doux",
  INSCRIT: "bg-accent-pale text-accent-fort",
  EN_FORMATION: "bg-alerte/12 text-alerte",
  TERMINE: "bg-succes/12 text-succes",
  ABANDONNE: "bg-danger-pale text-danger",
};

export const FINANCEMENTS: TypeFinancement[] = [
  "ENTREPRISE",
  "OPCO",
  "CPF",
  "FRANCE_TRAVAIL",
  "PERSONNEL",
  "AUTRE",
];

export const LIBELLE_FINANCEMENT: Record<TypeFinancement, string> = {
  ENTREPRISE: "Entreprise",
  OPCO: "OPCO",
  CPF: "CPF",
  FRANCE_TRAVAIL: "France Travail",
  PERSONNEL: "Personnel",
  AUTRE: "Autre",
};
