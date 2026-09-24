import "server-only";

import { randomUUID } from "node:crypto";

import { verifierFichier } from "@/lib/documents-depot";
import { formaterTaille } from "@/lib/documents-libelles";
import { prisma } from "@/lib/prisma";
import { stockage } from "@/lib/stockage";

const TAILLE_MAX_OCTETS = 2 * 1024 * 1024;

export type SignatureVerifiee = { octets: Uint8Array; typeMime: string; extension: string };

/// Contrôle l'image de signature reçue. Le PNG est attendu : c'est le seul
/// format courant qui garde un fond transparent, et l'écran de dépôt
/// convertit lui-même ce qu'on lui donne. Un JPEG reste accepté — il
/// s'affichera avec son fond blanc.
export async function verifierSignature(fichier: FormDataEntryValue | null): Promise<SignatureVerifiee | string> {
  const verifie = await verifierFichier(fichier);
  if (typeof verifie === "string") return verifie;

  if (verifie.typeMime !== "image/png" && verifie.typeMime !== "image/jpeg") {
    return "La signature doit être une image PNG ou JPG.";
  }
  if (verifie.octets.byteLength > TAILLE_MAX_OCTETS) {
    return `L'image fait ${formaterTaille(verifie.octets.byteLength)} : la taille maximale est de ${formaterTaille(TAILLE_MAX_OCTETS)}.`;
  }
  return { octets: verifie.octets, typeMime: verifie.typeMime, extension: verifie.extension };
}

/// Emplacement régénéré à chaque dépôt : jamais dérivé d'une saisie.
export const cheminSignature = (extension: string) => `organisme/signature-${randomUUID()}.${extension}`;
export const cheminLogo = (extension: string) => `organisme/logo-${randomUUID()}.${extension}`;

/// Les deux images de l'organisme, désignées par le champ qui les porte.
export const CHAMPS_IMAGE = {
  signature: "signatureCheminStockage",
  logo: "logoCheminStockage",
} as const;

export type ImageOrganisme = keyof typeof CHAMPS_IMAGE;

export type SignatureOrganisme = { octets: Uint8Array; typeMime: string };

/// Image de l'organisme à reprendre dans un document généré, si elle existe.
/// Une image introuvable dans le stockage n'est jamais une erreur bloquante :
/// le document se produit sans elle.
export async function lireImageOrganisme(quoi: ImageOrganisme): Promise<SignatureOrganisme | null> {
  const organisme = await prisma.organisme.findFirst({
    select: { signatureCheminStockage: true, logoCheminStockage: true },
  });
  const chemin = organisme?.[CHAMPS_IMAGE[quoi]];
  if (!chemin) return null;
  try {
    const blob = await stockage().lire(chemin);
    return {
      octets: new Uint8Array(await blob.arrayBuffer()),
      typeMime: blob.type || (chemin.endsWith(".png") ? "image/png" : "image/jpeg"),
    };
  } catch {
    console.error(`Image « ${quoi} » de l'organisme introuvable dans le stockage.`);
    return null;
  }
}

export const lireSignatureOrganisme = () => lireImageOrganisme("signature");
export const lireLogoOrganisme = () => lireImageOrganisme("logo");
