import type { ModaliteFormation, StatutFormation } from "@prisma/client";

export const MODALITES: ModaliteFormation[] = [
  "PRESENTIEL",
  "DISTANCIEL",
  "E_LEARNING",
  "HYBRIDE",
];

export const LIBELLE_MODALITE: Record<ModaliteFormation, string> = {
  PRESENTIEL: "Présentiel",
  DISTANCIEL: "Distanciel",
  E_LEARNING: "E-learning",
  HYBRIDE: "Hybride",
};

export const STATUTS_FORMATION: StatutFormation[] = ["BROUILLON", "ACTIVE", "ARCHIVEE"];

export const LIBELLE_STATUT_FORMATION: Record<StatutFormation, string> = {
  BROUILLON: "Brouillon",
  ACTIVE: "Active",
  ARCHIVEE: "Archivée",
};

export const TON_STATUT_FORMATION: Record<StatutFormation, string> = {
  BROUILLON: "bg-surface-creuse text-texte-doux",
  ACTIVE: "bg-succes/12 text-succes",
  ARCHIVEE: "bg-bordure-douce text-texte-tenu",
};

/// Affiche une durée sans décimales inutiles : « 14 h », « 10,5 h ».
export function formaterDuree(heures: unknown, jours: unknown): string {
  const nombre = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
  const parties: string[] = [];
  if (heures !== null && heures !== undefined) parties.push(`${nombre.format(Number(heures))} h`);
  if (jours !== null && jours !== undefined) {
    const j = Number(jours);
    parties.push(`${nombre.format(j)} jour${j > 1 ? "s" : ""}`);
  }
  return parties.length ? parties.join(" · ") : "—";
}
