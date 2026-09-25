import type { MoyenPaiement, StatutFacture, TypePayeur } from "@prisma/client";

export const TYPES_PAYEUR: TypePayeur[] = ["ENTREPRISE", "OPCO", "APPRENANT", "CAISSE_DES_DEPOTS", "FRANCE_TRAVAIL", "AUTRE"];

export const LIBELLE_PAYEUR: Record<TypePayeur, string> = {
  ENTREPRISE: "Entreprise",
  OPCO: "OPCO",
  APPRENANT: "Apprenant",
  CAISSE_DES_DEPOTS: "Caisse des Dépôts (CPF)",
  FRANCE_TRAVAIL: "France Travail",
  AUTRE: "Autre",
};

export const LIBELLE_STATUT_FACTURE: Record<StatutFacture, string> = {
  A_EMETTRE: "À émettre",
  EMISE: "Émise",
  PAYEE: "Payée",
  ANNULEE: "Annulée",
};

export const TON_STATUT_FACTURE: Record<StatutFacture, string> = {
  A_EMETTRE: "bg-alerte/12 text-alerte",
  EMISE: "bg-accent-pale text-accent-fort",
  PAYEE: "bg-succes/12 text-succes",
  ANNULEE: "bg-surface-creuse text-texte-tenu",
};

export const MOYENS_PAIEMENT: MoyenPaiement[] = ["VIREMENT", "CHEQUE", "CARTE", "PRELEVEMENT", "ESPECES", "AUTRE"];

export const LIBELLE_MOYEN: Record<MoyenPaiement, string> = {
  VIREMENT: "Virement",
  CHEQUE: "Chèque",
  CARTE: "Carte",
  PRELEVEMENT: "Prélèvement",
  ESPECES: "Espèces",
  AUTRE: "Autre",
};

/// Taux proposés. 0 % : formation professionnelle exonérée (article
/// 261-4-4° du CGI), le cas le plus fréquent pour un organisme déclaré.
export const TAUX_TVA = ["0", "5.5", "10", "20"];

/// Tous les calculs se font en centimes entiers : jamais d'arrondi flottant
/// sur un montant facturé.
export const enCentimes = (montant: unknown) => Math.round(Number(montant) * 100);
export const depuisCentimes = (centimes: number) => (centimes / 100).toFixed(2);

export function montantTTC(montantHT: string, tauxTva: string): string {
  const ht = enCentimes(montantHT);
  return depuisCentimes(ht + Math.round((ht * Number(tauxTva)) / 100));
}

/// Montant saisi en français (« 1 250,50 ») ou avec un point.
export function lireMontant(saisie: string): string | null {
  const propre = saisie.replace(/[\s €]/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(propre)) return null;
  return Number(propre).toFixed(2);
}

export type SituationFacture = {
  totalCentimes: number;
  payeCentimes: number;
  resteCentimes: number;
  enRetard: boolean;
};

export function situationFacture(
  f: { statut: StatutFacture; montantTTC: unknown; dateEcheance: Date | null },
  paiements: { montant: unknown }[],
  aujourdhui: Date,
): SituationFacture {
  const totalCentimes = enCentimes(f.montantTTC);
  const payeCentimes = paiements.reduce((t, p) => t + enCentimes(p.montant), 0);
  const resteCentimes = f.statut === "ANNULEE" ? 0 : Math.max(totalCentimes - payeCentimes, 0);
  return {
    totalCentimes,
    payeCentimes,
    resteCentimes,
    enRetard: f.statut === "EMISE" && resteCentimes > 0 && f.dateEcheance !== null && f.dateEcheance < aujourdhui,
  };
}

const euros = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

/// Montant comptable, toujours avec ses centimes : « 1 250,00 € ».
export function formaterMontant(montant: unknown): string {
  return euros.format(Number(montant));
}
