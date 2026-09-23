import type { Creneau, StatutPresence } from "@prisma/client";

import { ajouterJours } from "@/lib/sessions-libelles";

export const CRENEAUX: Creneau[] = ["MATIN", "APRES_MIDI"];

export const LIBELLE_CRENEAU: Record<Creneau, string> = {
  MATIN: "Matin",
  APRES_MIDI: "Après-midi",
};

export const STATUTS_PRESENCE: StatutPresence[] = ["PRESENT", "ABSENT", "ABSENT_JUSTIFIE"];

export const LIBELLE_PRESENCE: Record<StatutPresence, string> = {
  PRESENT: "Présent",
  ABSENT: "Absent",
  ABSENT_JUSTIFIE: "Absence justifiée",
};

export const TON_PRESENCE: Record<StatutPresence, string> = {
  PRESENT: "bg-succes/12 text-succes",
  ABSENT: "bg-danger-pale text-danger",
  ABSENT_JUSTIFIE: "bg-alerte/12 text-alerte",
};

/// Au-delà, une « session » est sans doute une erreur de saisie de dates.
const JOURS_MAX = 90;

/// Jours d'une session. Samedis et dimanches sont écartés, sauf s'ils sont le
/// premier ou le dernier jour (session organisée un week-end).
export function joursDeSession(debut: Date, fin: Date): Date[] {
  const jours: Date[] = [];
  for (let jour = debut; jour <= fin && jours.length < JOURS_MAX; jour = ajouterJours(jour, 1)) {
    const weekEnd = jour.getUTCDay() === 0 || jour.getUTCDay() === 6;
    const extremite = jour.getTime() === debut.getTime() || jour.getTime() === fin.getTime();
    if (!weekEnd || extremite) jours.push(jour);
  }
  return jours;
}

export const clePresence = (learnerId: string, jour: Date, creneau: Creneau) =>
  `${learnerId}|${jour.toISOString().slice(0, 10)}|${creneau}`;

/// Les présences sont-elles saisies pour tous les inscrits, sur toutes les
/// demi-journées déjà passées ou en cours ? Une session pas encore commencée
/// n'est jamais « complète ».
export function presencesCompletes(params: {
  jours: Date[];
  aujourdhui: Date;
  idsApprenants: string[];
  saisies: Set<string>;
}): { attendues: number; saisies: number; complet: boolean } {
  const passes = params.jours.filter((j) => j <= params.aujourdhui);
  let saisies = 0;
  for (const jour of passes)
    for (const creneau of CRENEAUX)
      for (const id of params.idsApprenants) if (params.saisies.has(clePresence(id, jour, creneau))) saisies++;
  const attendues = passes.length * CRENEAUX.length * params.idsApprenants.length;
  return { attendues, saisies, complet: attendues > 0 && saisies === attendues };
}

/// Horaires réels de chaque demi-journée, lus dans le champ libre de la
/// session (« 9h00–12h30 / 13h30–17h00 »). Le séparateur attendu est une
/// barre oblique ; à défaut, le texte entier sert aux deux demi-journées.
/// Sans horaires saisis, la feuille n'en affiche simplement aucun.
export function horairesDemiJournees(horaires: string | null): Record<Creneau, string | null> {
  const texte = horaires?.trim();
  if (!texte) return { MATIN: null, APRES_MIDI: null };
  const parties = texte.split("/").map((p) => p.trim()).filter(Boolean);
  if (parties.length >= 2) return { MATIN: parties[0], APRES_MIDI: parties[1] };
  return { MATIN: texte, APRES_MIDI: texte };
}

/// Demi-journées d'une session déjà commencées à la date donnée. La feuille
/// d'émargement se fait signer le jour même : aucune raison d'en produire une
/// pour une demi-journée à venir, et un risque de la faire signer à l'avance.
export function demiJourneesJusqua(debut: Date, fin: Date, aujourdhui: Date): { jour: Date; creneau: Creneau }[] {
  return joursDeSession(debut, fin)
    .filter((jour) => jour <= aujourdhui)
    .flatMap((jour) => CRENEAUX.map((creneau) => ({ jour, creneau })));
}
