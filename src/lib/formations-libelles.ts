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

/// Plateformes de formation en ligne (client, 01/10/2026).
export const LIBELLE_PLATEFORME = {
  EFORMA: "E-forma",
  MON_PARCOURS_EN_LIGNE: "Mon Parcours En Ligne",
} as const;


/// Sessions suivies sur une plateforme en ligne : pas d'émargement par QR
/// code ; la fin de formation de chaque stagiaire est la fin de son parcours
/// (100 %), validée sur la session.
export const MODALITES_EN_LIGNE = ["E_LEARNING", "HYBRIDE"] as const;
export function modaliteEnLigne(modalite: string): boolean {
  return (MODALITES_EN_LIGNE as readonly string[]).includes(modalite);
}

/// Certification telle qu'on l'affiche (catalogue, sessions) : son type et
/// son numéro, tiré du code saisi (« TOSA RS 7256 » → « RS 7256 ») ;
/// RNCP : niveau en plus. Null si la formation n'est pas certifiante.
export function libelleCertification(f: { typeCertification: string | null; certification?: string | null; niveauCertification?: string | null }): string | null {
  if (f.typeCertification !== "RS" && f.typeCertification !== "RNCP") return null;
  const texte = f.certification ?? "";
  const numero = texte.match(/(?:RS|RNCP)\s*-?\s*(\d{3,6})/i)?.[1] ?? texte.match(/\b(\d{3,6})\b/)?.[1];
  const base = numero ? `${f.typeCertification} ${numero}` : f.typeCertification;
  return f.typeCertification === "RNCP" && f.niveauCertification ? `${base} – niveau ${f.niveauCertification}` : base;
}
