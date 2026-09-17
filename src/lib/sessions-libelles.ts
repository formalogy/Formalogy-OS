import type { StatutSession } from "@prisma/client";

export const STATUTS_SESSION: StatutSession[] = [
  "BROUILLON",
  "A_PREPARER",
  "DOCUMENTS_EN_ATTENTE",
  "PRETE",
  "EN_COURS",
  "TERMINEE",
  "CLOTUREE",
  "ANNULEE",
];

export const LIBELLE_STATUT_SESSION: Record<StatutSession, string> = {
  BROUILLON: "Brouillon",
  A_PREPARER: "À préparer",
  DOCUMENTS_EN_ATTENTE: "Documents en attente",
  PRETE: "Prête",
  EN_COURS: "En cours",
  TERMINEE: "Terminée",
  CLOTUREE: "Clôturée",
  ANNULEE: "Annulée",
};

export const TON_STATUT_SESSION: Record<StatutSession, string> = {
  BROUILLON: "bg-surface-creuse text-texte-doux",
  A_PREPARER: "bg-alerte/12 text-alerte",
  DOCUMENTS_EN_ATTENTE: "bg-alerte/12 text-alerte",
  PRETE: "bg-accent-pale text-accent-fort",
  EN_COURS: "bg-succes/12 text-succes",
  TERMINEE: "bg-succes/12 text-succes",
  CLOTUREE: "bg-bordure-douce text-texte-tenu",
  ANNULEE: "bg-danger-pale text-danger",
};

/// Liseré coloré utilisé dans le planning, où la place manque pour un libellé.
export const BORDURE_STATUT_SESSION: Record<StatutSession, string> = {
  BROUILLON: "border-l-texte-tenu",
  A_PREPARER: "border-l-alerte",
  DOCUMENTS_EN_ATTENTE: "border-l-alerte",
  PRETE: "border-l-accent",
  EN_COURS: "border-l-succes",
  TERMINEE: "border-l-succes",
  CLOTUREE: "border-l-texte-tenu",
  ANNULEE: "border-l-danger",
};

// ---------------------------------------------------------------------------
// Dates de session
//
// Une date de session est un jour calendaire, pas un instant. Elle est
// stockée à minuit UTC et toujours manipulée en UTC : sinon, selon le fuseau
// du serveur ou l'heure d'été, une session du 20 pourrait s'afficher le 19.
// ---------------------------------------------------------------------------

/// « 2026-09-20 » → date à minuit UTC. Retourne null si la saisie est invalide.
export function jourDepuisSaisie(valeur: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valeur)) return null;
  const date = new Date(`${valeur}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/// Date → « 2026-09-20 », pour un champ de formulaire.
export function jourVersSaisie(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/// Aujourd'hui, à minuit UTC, selon le calendrier français.
export function aujourdhuiUTC(): Date {
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
  return new Date(`${iso}T00:00:00.000Z`);
}

export function ajouterJours(date: Date, jours: number): Date {
  const copie = new Date(date);
  copie.setUTCDate(copie.getUTCDate() + jours);
  return copie;
}

const jourCourt = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const jourComplet = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/// « 20 sept. 2026 » ou « 20–22 sept. 2026 » ou « 30 sept. – 2 oct. 2026 ».
export function formaterPeriode(debut: Date, fin: Date): string {
  if (debut.getTime() === fin.getTime()) return jourComplet.format(debut);
  const memeMois =
    debut.getUTCMonth() === fin.getUTCMonth() && debut.getUTCFullYear() === fin.getUTCFullYear();
  if (memeMois) return `${debut.getUTCDate()}–${jourComplet.format(fin)}`;
  return `${jourCourt.format(debut)} – ${jourComplet.format(fin)}`;
}

// ---------------------------------------------------------------------------
// Liste de contrôle
// ---------------------------------------------------------------------------

export type ElementControle = {
  libelle: string;
  fait: boolean;
  /// Phase qui automatisera ce point, tant qu'il n'est pas encore géré
  phase?: number;
};

/// Liste de contrôle d'une session (cahier des charges, section 12).
///
/// Chaque point est calculé à partir des données réelles. Les points dont le
/// module n'existe pas encore restent non cochés, avec la phase qui les
/// prendra en charge : on ne coche jamais « pour faire joli ».
export function listeDeControle(session: {
  nombreInscrits: number;
  conventionDeposee: boolean;
  conventionSignee: boolean;
  presencesCompletes: boolean;
  feuilleEmargementDeposee: boolean;
  evaluationsCompletes: boolean;
  attestationsCompletes: boolean;
}): ElementControle[] {
  return [
    { libelle: "Formation et dates définies", fait: true },
    { libelle: "Apprenants inscrits", fait: session.nombreInscrits > 0 },
    { libelle: "Convention déposée", fait: session.conventionDeposee },
    { libelle: "Convention signée", fait: session.conventionSignee },
    { libelle: "Programme envoyé", fait: false, phase: 9 },
    { libelle: "Convocations envoyées", fait: false, phase: 9 },
    { libelle: "Présences saisies", fait: session.presencesCompletes },
    { libelle: "Feuilles d'émargement déposées", fait: session.feuilleEmargementDeposee },
    { libelle: "Évaluations des acquis", fait: session.evaluationsCompletes },
    { libelle: "Attestations", fait: session.attestationsCompletes },
    { libelle: "Facture", fait: false, phase: 13 },
  ];
}
