import "server-only";

import { randomUUID } from "node:crypto";

import { verifierFichier } from "@/lib/documents-depot";
import { formaterTaille } from "@/lib/documents-libelles";

const TAILLE_MAX_PHOTO_OCTETS = 5 * 1024 * 1024;

export type PhotoVerifiee = {
  octets: Uint8Array;
  typeMime: string;
  extension: string;
};

/// Contrôle une photo de profil reçue : mêmes vérifications qu'un document
/// (taille, signature du contenu), restreintes aux formats image et à une
/// taille raisonnable pour un avatar.
export async function verifierPhoto(fichier: FormDataEntryValue | null): Promise<PhotoVerifiee | string> {
  const verifie = await verifierFichier(fichier);
  if (typeof verifie === "string") return verifie;

  if (!verifie.typeMime.startsWith("image/")) {
    return "La photo doit être une image (PNG ou JPG).";
  }
  if (verifie.octets.byteLength > TAILLE_MAX_PHOTO_OCTETS) {
    return `L'image fait ${formaterTaille(verifie.octets.byteLength)} : la taille maximale pour une photo est de ${formaterTaille(TAILLE_MAX_PHOTO_OCTETS)}.`;
  }

  return { octets: verifie.octets, typeMime: verifie.typeMime, extension: verifie.extension };
}

/// Emplacement de stockage, régénéré à chaque nouvelle photo : jamais dérivé
/// d'une saisie, impossible d'écraser un autre fichier.
export function cheminPhoto(learnerId: string, extension: string): string {
  return `apprenants/${learnerId}/photo-${randomUUID()}.${extension}`;
}
