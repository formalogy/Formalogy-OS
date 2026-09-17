import "server-only";

import type { PDFFont } from "pdf-lib";

/// Lettres sans décomposition Unicode, remplacées par leur plus proche équivalent.
const LETTRES_PROCHES: Record<string, string> = { ł: "l", Ł: "L", đ: "d", Đ: "D", ı: "i", ß: "ss", "’": "'", "‘": "'", "“": '"', "”": '"' };

/// Les polices standard des PDF ne couvrent que l'alphabet latin occidental :
/// un caractère non représentable est remplacé plutôt que de faire échouer
/// toute la génération.
export function texteSur(police: PDFFont, texte: string): string {
  return [...texte]
    .map((c) => {
      try {
        police.encodeText(c);
        return c;
      } catch {
        const proche = (LETTRES_PROCHES[c] ?? c).normalize("NFD").replace(/\p{M}/gu, "");
        try {
          police.encodeText(proche);
          return proche;
        } catch {
          return "?";
        }
      }
    })
    .join("");
}

/// Coupe un texte trop long pour sa colonne en terminant par « … ».
export function tronquer(police: PDFFont, texte: string, taille: number, largeurMax: number): string {
  let t = texteSur(police, texte);
  if (police.widthOfTextAtSize(t, taille) <= largeurMax) return t;
  while (t.length > 1 && police.widthOfTextAtSize(`${t}…`, taille) > largeurMax) t = t.slice(0, -1);
  return `${t}…`;
}

/// Découpe un texte en lignes tenant dans la largeur donnée, en respectant
/// les retours à la ligne existants.
export function lignesDe(police: PDFFont, texte: string, taille: number, largeurMax: number): string[] {
  const lignes: string[] = [];
  // Découpage d'abord : le retour à la ligne n'est pas un caractère imprimable.
  for (const paragraphe of texte.split(/\r?\n/).map((p) => texteSur(police, p))) {
    let courante = "";
    for (const mot of paragraphe.split(/\s+/).filter(Boolean)) {
      const essai = courante ? `${courante} ${mot}` : mot;
      if (police.widthOfTextAtSize(essai, taille) <= largeurMax) {
        courante = essai;
      } else {
        if (courante) lignes.push(courante);
        courante = police.widthOfTextAtSize(mot, taille) <= largeurMax ? mot : tronquer(police, mot, taille, largeurMax);
      }
    }
    lignes.push(courante);
  }
  return lignes;
}
