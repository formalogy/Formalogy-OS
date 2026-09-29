import type { TypePayeur } from "@prisma/client";

import { ajouterJours } from "@/lib/sessions-libelles";

/// Délais de paiement constatés par le client (29/09/2026), comptés à partir
/// de la déclaration de sortie de formation, faite le lendemain du dernier
/// jour de la session : la Caisse des Dépôts paie un dossier CPF 35 jours
/// après, un OPCO entre 45 et 60 jours après. Les autres payeurs n'ont pas de
/// délai connu : leur facture garde l'échéance habituelle.
export const DELAIS_PAIEMENT: Partial<Record<TypePayeur, { min: number; max: number }>> = {
  CAISSE_DES_DEPOTS: { min: 35, max: 35 },
  OPCO: { min: 45, max: 60 },
};

/// Échéance d'une facture dont le payeur n'a pas de délai connu.
export const ECHEANCE_PAR_DEFAUT_JOURS = 30;

/// La sortie de formation se déclare le lendemain du dernier jour.
export const dateDeSortie = (dateFin: Date) => ajouterJours(dateFin, 1);

export type PaiementAttendu = { du: Date; au: Date; sortie: Date; delai: { min: number; max: number } };

/// Période où le paiement doit arriver, d'après le payeur et la fin de la
/// session. Null pour un payeur sans délai connu.
export function paiementAttendu(payeur: TypePayeur, dateFinSession: Date): PaiementAttendu | null {
  const delai = DELAIS_PAIEMENT[payeur];
  if (!delai) return null;
  const sortie = dateDeSortie(dateFinSession);
  return { du: ajouterJours(sortie, delai.min), au: ajouterJours(sortie, delai.max), sortie, delai };
}

/// Échéance à porter sur une facture : la fin de la période de paiement
/// attendue (passé ce jour, le paiement est en retard), sinon l'échéance
/// habituelle après l'émission.
export function echeanceFacture(payeur: TypePayeur, dateFinSession: Date | null, dateEmission: Date): Date {
  const attendu = dateFinSession ? paiementAttendu(payeur, dateFinSession) : null;
  return attendu ? attendu.au : ajouterJours(dateEmission, ECHEANCE_PAR_DEFAUT_JOURS);
}

const jourMois = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" });
const jourMoisAnnee = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/// « le 3 novembre 2026 », ou « entre le 13 et le 28 novembre 2026 ».
export function textePaiementAttendu(p: { du: Date; au: Date }): string {
  if (p.du.getTime() === p.au.getTime()) return `le ${jourMoisAnnee.format(p.du)}`;
  const memeMois = p.du.getUTCMonth() === p.au.getUTCMonth() && p.du.getUTCFullYear() === p.au.getUTCFullYear();
  return `entre le ${memeMois ? p.du.getUTCDate() : jourMois.format(p.du)} et le ${jourMoisAnnee.format(p.au)}`;
}

/// « 35 jours après la sortie du 30 septembre » : d'où vient la date.
export function explicationPaiementAttendu(p: PaiementAttendu): string {
  const jours = p.delai.min === p.delai.max ? `${p.delai.min} jours` : `${p.delai.min} à ${p.delai.max} jours`;
  return `${jours} après la déclaration de sortie du ${jourMois.format(p.sortie)}`;
}

const jourCourt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });

/// « 3 nov. », ou « 13 nov. – 28 nov. », pour une liste.
export function periodeCourte(p: { du: Date; au: Date }): string {
  return p.du.getTime() === p.au.getTime() ? jourCourt.format(p.du) : `${jourCourt.format(p.du)} – ${jourCourt.format(p.au)}`;
}
