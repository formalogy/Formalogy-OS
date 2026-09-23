import type { CategorieDocument, StatutDocument } from "@prisma/client";

export const CATEGORIES_DOCUMENT: CategorieDocument[] = [
  "APPRENANT",
  "ENTREPRISE",
  "SESSION",
  "FORMATEUR",
  "FORMATION",
  "FINANCE",
  "QUALIOPI",
];

export const LIBELLE_CATEGORIE_DOCUMENT: Record<CategorieDocument, string> = {
  APPRENANT: "Apprenants",
  ENTREPRISE: "Entreprises",
  SESSION: "Sessions",
  FORMATEUR: "Formateurs",
  FORMATION: "Formations",
  FINANCE: "Finance",
  QUALIOPI: "Qualiopi",
};

export const STATUTS_DOCUMENT: StatutDocument[] = ["BROUILLON", "VALIDE", "ARCHIVE"];

export const LIBELLE_STATUT_DOCUMENT: Record<StatutDocument, string> = {
  BROUILLON: "Brouillon",
  VALIDE: "Validé",
  ARCHIVE: "Archivé",
};

export const TON_STATUT_DOCUMENT: Record<StatutDocument, string> = {
  BROUILLON: "bg-surface-creuse text-texte-doux",
  VALIDE: "bg-succes/12 text-succes",
  ARCHIVE: "bg-bordure-douce text-texte-tenu",
};

/// Taille maximale d'un fichier déposé.
export const TAILLE_MAX_OCTETS = 15 * 1024 * 1024;

/// Formats acceptés. Tout le reste est refusé : un organisme de formation n'a
/// pas besoin de déposer d'exécutables ou d'archives, et les refuser ferme une
/// porte à des fichiers malveillants.
export const TYPE_MIME_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const FORMATS_ACCEPTES: Record<string, { extensions: string[]; apercu: boolean }> = {
  "application/pdf": { extensions: ["pdf"], apercu: true },
  "image/png": { extensions: ["png"], apercu: true },
  "image/jpeg": { extensions: ["jpg", "jpeg"], apercu: true },
  // apercu: false — un .docx ne s'affiche pas tel quel ; l'écran du document
  // en propose une vue convertie en PDF à la volée.
  [TYPE_MIME_DOCX]: { extensions: ["docx"], apercu: false },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { extensions: ["xlsx"], apercu: false },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": { extensions: ["pptx"], apercu: false },
  "application/vnd.oasis.opendocument.text": { extensions: ["odt"], apercu: false },
  "application/vnd.oasis.opendocument.spreadsheet": { extensions: ["ods"], apercu: false },
  "text/csv": { extensions: ["csv"], apercu: false },
  "text/plain": { extensions: ["txt"], apercu: false },
};

export const ATTRIBUT_ACCEPT = Object.values(FORMATS_ACCEPTES)
  .flatMap((f) => f.extensions)
  .map((e) => `.${e}`)
  .join(",");

/// Vérifie qu'un fichier est bien ce qu'il prétend être, en lisant ses
/// premiers octets. Un fichier renommé en « .pdf » ne passe pas.
export function signatureConforme(typeMime: string, octets: Uint8Array): boolean {
  const debut = (...valeurs: number[]) => valeurs.every((v, i) => octets[i] === v);
  switch (typeMime) {
    case "application/pdf":
      return debut(0x25, 0x50, 0x44, 0x46); // %PDF
    case "image/png":
      return debut(0x89, 0x50, 0x4e, 0x47);
    case "image/jpeg":
      return debut(0xff, 0xd8, 0xff);
    case "text/csv":
    case "text/plain":
      // Un fichier texte ne doit pas contenir d'octet nul.
      return !octets.subarray(0, 4096).includes(0);
    default:
      // Formats Office et OpenDocument : ce sont des archives ZIP.
      return debut(0x50, 0x4b, 0x03, 0x04);
  }
}

export function formaterTaille(octets: number): string {
  const nombre = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${nombre.format(octets / 1024)} Ko`;
  if (octets < 1024 * 1024 * 1024) return `${nombre.format(octets / (1024 * 1024))} Mo`;
  return `${nombre.format(octets / (1024 * 1024 * 1024))} Go`;
}
