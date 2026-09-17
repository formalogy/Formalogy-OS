import type { SourceProspect, StatutProspect } from "@prisma/client";

/// Ordre d'avancement du cycle commercial : il structure l'affichage du CRM.
export const STATUTS_ORDONNES: StatutProspect[] = [
  "NOUVEAU",
  "A_CONTACTER",
  "CONTACTE",
  "RELANCE",
  "PROPOSITION_ENVOYEE",
  "NEGOCIATION",
  "GAGNE",
  "PERDU",
];

export const LIBELLE_STATUT: Record<StatutProspect, string> = {
  NOUVEAU: "Nouveau",
  A_CONTACTER: "À contacter",
  CONTACTE: "Contacté",
  RELANCE: "Relance",
  PROPOSITION_ENVOYEE: "Proposition envoyée",
  NEGOCIATION: "Négociation",
  GAGNE: "Gagné",
  PERDU: "Perdu",
};

/// Couleur sémantique, distincte de l'accent de l'interface : elle encode
/// l'état commercial, pas l'identité visuelle.
export const TON_STATUT: Record<StatutProspect, string> = {
  NOUVEAU: "bg-surface-creuse text-texte-doux",
  A_CONTACTER: "bg-alerte/12 text-alerte",
  CONTACTE: "bg-accent-pale text-accent-fort",
  RELANCE: "bg-alerte/12 text-alerte",
  PROPOSITION_ENVOYEE: "bg-accent-pale text-accent-fort",
  NEGOCIATION: "bg-accent-pale text-accent-fort",
  GAGNE: "bg-succes/12 text-succes",
  PERDU: "bg-danger-pale text-danger",
};

export const SOURCES_ORDONNEES: SourceProspect[] = [
  "SITE_INTERNET",
  "CPF",
  "RECOMMANDATION",
  "PROSPECTION",
  "EMAIL",
  "TELEPHONE",
  "PARTENAIRE",
  "AUTRE",
];

export const LIBELLE_SOURCE: Record<SourceProspect, string> = {
  SITE_INTERNET: "Site internet",
  CPF: "CPF",
  RECOMMANDATION: "Recommandation",
  PROSPECTION: "Prospection",
  EMAIL: "Email",
  TELEPHONE: "Téléphone",
  PARTENAIRE: "Partenaire",
  AUTRE: "Autre",
};

const euros = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const eurosCentimes = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
});

/// « 1 200 € » pour un montant rond, « 450,50 € » sinon : les centimes ne
/// sont jamais arrondis silencieusement.
export function formaterEuros(montant: unknown): string {
  if (montant === null || montant === undefined) return "—";
  const valeur = Number(montant);
  return Number.isInteger(valeur) ? euros.format(valeur) : eurosCentimes.format(valeur);
}

const dateCourte = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function formaterDate(date: Date | null | undefined): string {
  return date ? dateCourte.format(date) : "—";
}
