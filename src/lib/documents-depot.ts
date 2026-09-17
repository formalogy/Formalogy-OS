import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { FORMATS_ACCEPTES, formaterTaille, signatureConforme, TAILLE_MAX_OCTETS } from "@/lib/documents-libelles";

export type FichierVerifie = {
  octets: Uint8Array;
  typeMime: string;
  extension: string;
  nomFichier: string;
  empreinte: string;
};

/// Contrôle un fichier reçu. On ne fait confiance ni au nom, ni au type
/// annoncé par le navigateur : l'extension doit correspondre à un format
/// accepté, et les premiers octets doivent confirmer ce format.
export async function verifierFichier(fichier: FormDataEntryValue | null): Promise<FichierVerifie | string> {
  if (!(fichier instanceof File) || fichier.size === 0) return "Choisissez un fichier.";
  if (fichier.size > TAILLE_MAX_OCTETS) {
    return `Le fichier fait ${formaterTaille(fichier.size)} : la taille maximale est de ${formaterTaille(TAILLE_MAX_OCTETS)}.`;
  }

  const extension = fichier.name.split(".").pop()?.toLowerCase() ?? "";
  const typeMime = Object.entries(FORMATS_ACCEPTES).find(([, f]) => f.extensions.includes(extension))?.[0];
  if (!typeMime) {
    return "Format non accepté. Formats possibles : PDF, image (PNG, JPG), Word, Excel, PowerPoint, OpenDocument, CSV, texte.";
  }

  const octets = new Uint8Array(await fichier.arrayBuffer());
  if (!signatureConforme(typeMime, octets)) {
    return `Le contenu du fichier ne correspond pas à son extension « .${extension} ». Le fichier est peut-être endommagé ou mal renommé.`;
  }

  // Le nom d'origine est conservé pour l'affichage et le téléchargement, mais
  // débarrassé des caractères qui pourraient poser problème.
  const nomFichier = fichier.name.replace(/[\\/\u0000-\u001f"]/g, "_").slice(0, 200);

  return {
    octets,
    typeMime,
    extension,
    nomFichier,
    empreinte: createHash("sha256").update(octets).digest("hex"),
  };
}

/// Emplacement de stockage généré par le serveur, jamais dérivé d'une saisie :
/// impossible d'écraser un autre fichier ou de sortir du dossier prévu.
export function cheminStockage(documentId: string, numero: number, extension: string) {
  return `${documentId}/v${numero}-${randomUUID()}.${extension}`;
}

