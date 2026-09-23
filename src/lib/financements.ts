import type { TypeFinanceur } from "@prisma/client";

export const TYPES_FINANCEUR: TypeFinanceur[] = ["OPCO", "FRANCE_TRAVAIL", "CPF", "ENTREPRISE", "AUTRE"];

export const LIBELLE_FINANCEUR: Record<TypeFinanceur, string> = {
  OPCO: "OPCO",
  FRANCE_TRAVAIL: "France Travail",
  CPF: "CPF",
  ENTREPRISE: "Entreprise",
  AUTRE: "Autre",
};

/// Les OPCO les plus courants, proposés à la saisie. La liste reste libre :
/// un financeur absent se tape à la main.
export const OPCO_COURANTS = [
  "AFDAS",
  "AKTO",
  "ATLAS",
  "Constructys",
  "L'Opcommerce",
  "OCAPIAT",
  "OPCO 2i",
  "OPCO EP",
  "OPCO Mobilités",
  "OPCO Santé",
  "Uniformation",
];
