import type { TypeFinancement, TypePayeur } from "@prisma/client";

/// À qui facturer une inscription : les choix proposés à l'inscription.
export const PAYEURS_INSCRIPTION = ["ENTREPRISE", "OPCO", "FRANCE_TRAVAIL", "CAISSE_DES_DEPOTS", "APPRENANT"] as const;
export type PayeurInscription = (typeof PAYEURS_INSCRIPTION)[number];

export const LIBELLE_PAYEUR_INSCRIPTION: Record<PayeurInscription, string> = {
  ENTREPRISE: "L'entreprise (elle finance elle-même)",
  OPCO: "Un OPCO (subrogation de paiement)",
  FRANCE_TRAVAIL: "France Travail (subrogation de paiement)",
  CAISSE_DES_DEPOTS: "La Caisse des Dépôts (CPF)",
  APPRENANT: "L'apprenant (financement personnel)",
};

/// Payeurs facturés au nom d'un financeur tiers, dont le nom se saisit.
export const estFinanceurTiers = (payeur: string) => payeur === "OPCO" || payeur === "FRANCE_TRAVAIL";

/// Payeur proposé d'après le financement indiqué sur la fiche apprenant.
export function payeurParDefaut(financement: TypeFinancement, aUneEntreprise: boolean): PayeurInscription {
  if (financement === "CPF") return "CAISSE_DES_DEPOTS";
  if (financement === "OPCO") return "OPCO";
  if (financement === "FRANCE_TRAVAIL") return "FRANCE_TRAVAIL";
  if (financement === "ENTREPRISE" && aUneEntreprise) return "ENTREPRISE";
  return "APPRENANT";
}

/// Payeur d'une inscription en quelques mots, pour la liste des inscrits.
export function decrirePayeur(payeur: TypePayeur, precisions: { entreprise?: string | null; financeur?: string | null; dossier?: string | null }): string {
  if (payeur === "ENTREPRISE") return precisions.entreprise ? `facturé à ${precisions.entreprise}` : "facturé à l'entreprise";
  if (payeur === "OPCO" || payeur === "FRANCE_TRAVAIL") {
    return `facturé à ${precisions.financeur ?? (payeur === "OPCO" ? "l'OPCO" : "France Travail")}${precisions.dossier ? ` (dossier ${precisions.dossier})` : ""}`;
  }
  if (payeur === "CAISSE_DES_DEPOTS") return "facturé à la Caisse des Dépôts (CPF)";
  if (payeur === "APPRENANT") return "facturé à l'apprenant";
  return "à facturer à la main";
}

/// Les onze OPCO, proposés à la saisie du financeur (la liste reste libre).
export const OPCO_CONNUS = [
  "AFDAS",
  "AKTO",
  "ATLAS",
  "Constructys",
  "OCAPIAT",
  "OPCO 2i",
  "OPCO Cohésion sociale",
  "OPCO Commerce",
  "OPCO EP",
  "OPCO Mobilités",
  "OPCO Santé",
];
