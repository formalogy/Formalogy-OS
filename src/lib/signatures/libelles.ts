import type { StatutSignature } from "@prisma/client";

export const LIBELLE_STATUT_SIGNATURE: Record<StatutSignature, string> = {
  A_ENVOYER: "À envoyer",
  ENVOYEE: "En attente de signature",
  SIGNEE: "Signée",
  ANNULEE: "Annulée",
};

export const TON_STATUT_SIGNATURE: Record<StatutSignature, string> = {
  A_ENVOYER: "bg-alerte/12 text-alerte",
  ENVOYEE: "bg-accent-pale text-accent-fort",
  SIGNEE: "bg-succes/12 text-succes",
  ANNULEE: "bg-surface-creuse text-texte-tenu",
};

/// Référence à reporter dans le titre du document sur BoldSign.
export const MOTIF_REFERENCE = /\bSIG-\d{4}-\d{4}\b/g;

export type Signataire = { nom: string; email: string };

export const NOMBRE_MAX_SIGNATAIRES = 4;

/// Titre à copier tel quel dans BoldSign : la référence en tête garantit
/// qu'elle figure dans l'email de fin de signature, même si le titre est tronqué.
export function titreBoldSign(reference: string, nomDocument: string): string {
  return `${reference} — ${nomDocument}`.slice(0, 200);
}

/// Au-delà de 5 Mo, BoldSign n'attache plus le document signé à son email :
/// le rapprochement automatique est alors impossible.
export const TAILLE_MAX_PIECE_JOINTE_BOLDSIGN = 5 * 1024 * 1024;
