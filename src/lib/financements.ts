import type { StatutDossier, TypeFinanceur } from "@prisma/client";

export const TYPES_FINANCEUR: TypeFinanceur[] = ["OPCO", "FRANCE_TRAVAIL", "CPF", "ENTREPRISE", "AUTRE"];

export const LIBELLE_FINANCEUR: Record<TypeFinanceur, string> = {
  OPCO: "OPCO",
  FRANCE_TRAVAIL: "France Travail",
  CPF: "CPF",
  ENTREPRISE: "Entreprise",
  AUTRE: "Autre",
};

export const STATUTS_DOSSIER: StatutDossier[] = ["A_MONTER", "DEPOSE", "ACCORDE", "REFUSE", "ANNULE"];

export const LIBELLE_STATUT_DOSSIER: Record<StatutDossier, string> = {
  A_MONTER: "À déposer",
  DEPOSE: "Déposé, en attente",
  ACCORDE: "Accordé",
  REFUSE: "Refusé",
  ANNULE: "Annulé",
};

export const TON_STATUT_DOSSIER: Record<StatutDossier, string> = {
  A_MONTER: "bg-alerte/12 text-alerte",
  DEPOSE: "bg-accent-pale text-accent-fort",
  ACCORDE: "bg-succes/12 text-succes",
  REFUSE: "bg-danger-pale text-danger",
  ANNULE: "bg-surface-creuse text-texte-tenu",
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

/// Ce qui demande une action : dossier à déposer dont la date limite approche,
/// ou dossier déposé sans réponse depuis longtemps.
export function alerteDossier(
  d: { statut: StatutDossier; dateLimite: Date | null; dateDepot: Date | null },
  aujourdhui: Date,
  joursSansReponse = 15,
): string | null {
  const jours = (depuis: Date) => Math.round((aujourdhui.getTime() - depuis.getTime()) / 86400000);
  if (d.statut === "A_MONTER" && d.dateLimite) {
    const reste = -jours(d.dateLimite);
    if (reste < 0) return `date limite dépassée depuis ${-reste} jour(s)`;
    if (reste <= 7) return reste === 0 ? "date limite aujourd'hui" : `à déposer sous ${reste} jour(s)`;
  }
  if (d.statut === "DEPOSE" && d.dateDepot) {
    const attente = jours(d.dateDepot);
    if (attente >= joursSansReponse) return `sans réponse depuis ${attente} jours`;
  }
  return null;
}
