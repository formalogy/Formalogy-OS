import "server-only";

import { unzipSync } from "fflate";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { lignesDe, texteSur } from "@/lib/pdf-outils";

// ---------------------------------------------------------------------------
// Conversion d'un .docx en PDF, sans outil extérieur.
//
// Le choix : plutôt que d'installer LibreOffice (impossible sur un
// hébergement sans serveur) ou d'envoyer le document à un service de
// conversion (coût, et données d'apprenants qui sortent), on lit la structure
// du document Word et on la redessine avec la même bibliothèque PDF que les
// attestations. Les conventions de Formalogy n'ont pas d'image et n'utilisent
// les tableaux que comme encadrés : cette structure-là se restitue fidèlement.
//
// Ce qui n'est PAS repris : images, colonnes multiples, tableaux à plusieurs
// colonnes, polices personnalisées. Un modèle qui en contiendrait devrait
// passer par un vrai convertisseur.
// ---------------------------------------------------------------------------

const A4 = { largeur: 595.28, hauteur: 841.89 };
const MARGE = 56;
const LARGEUR_UTILE = A4.largeur - 2 * MARGE;

type Fragment = { texte: string; gras: boolean; couleur?: string; taille: number };
type Bloc =
  | { genre: "paragraphe"; fragments: Fragment[]; taille: number; centre: boolean }
  | { genre: "encadre"; fragments: Fragment[] }
  | { genre: "espace" };

const decoder = new TextDecoder();

function texteXml(valeur: string): string {
  return valeur
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/// Taille par défaut quand le document ne la précise pas.
const TAILLE_PAR_DEFAUT = 9.5;

/// Fragments de texte d'un paragraphe, avec leur mise en forme. Word exprime
/// la taille en demi-points (« 32 » = 16 pt) — c'est là qu'elle se trouve
/// réellement : ces modèles n'utilisent aucun style de titre nommé.
function fragmentsDe(xmlParagraphe: string): Fragment[] {
  const fragments: Fragment[] = [];
  for (const [, runXml] of xmlParagraphe.matchAll(/<w:r(?: [^>]*)?>([\s\S]*?)<\/w:r>/g)) {
    const proprietes = /<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(runXml)?.[1] ?? "";
    const gras = /<w:b\/>|<w:b [^>]*\/>/.test(proprietes);
    const couleur = /<w:color w:val="([0-9A-Fa-f]{6})"/.exec(proprietes)?.[1];
    const demiPoints = Number(/<w:sz w:val="(\d+)"/.exec(proprietes)?.[1]);
    const taille = Number.isFinite(demiPoints) && demiPoints > 0 ? demiPoints / 2 : TAILLE_PAR_DEFAUT;
    // Un saut de ligne explicite dans Word compte comme du texte.
    const morceaux = runXml.replace(/<w:br\/>/g, "\n<w:t>\n</w:t>");
    let texte = "";
    for (const [, t] of morceaux.matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>/g)) texte += texteXml(t);
    if (texte) fragments.push({ texte, gras, couleur, taille });
  }
  return fragments;
}

/// Un paragraphe prend la taille de son plus gros fragment : c'est ainsi que
/// se reconnaît un titre dans un document qui n'utilise pas de styles nommés.
function tailleEtAlignement(xmlParagraphe: string, fragments: Fragment[]) {
  const alignement = /<w:jc w:val="([^"]+)"/.exec(xmlParagraphe)?.[1] ?? "";
  return {
    taille: fragments.length > 0 ? Math.max(...fragments.map((f) => f.taille)) : TAILLE_PAR_DEFAUT,
    centre: alignement === "center",
  };
}

/// Lit le corps du document dans l'ordre : paragraphes et tableaux mêlés.
function blocsDuDocument(xml: string): Bloc[] {
  const corps = /<w:body>([\s\S]*)<\/w:body>/.exec(xml)?.[1] ?? xml;
  const blocs: Bloc[] = [];

  // Paragraphes et tableaux de premier niveau, dans l'ordre du document.
  const motif = /<w:tbl>[\s\S]*?<\/w:tbl>|<w:p(?: [^>]*)?>[\s\S]*?<\/w:p>|<w:p(?: [^>]*)?\/>/g;
  for (const [element] of corps.matchAll(motif)) {
    if (element.startsWith("<w:tbl>")) {
      // Les tableaux servent d'encadrés : chaque cellule devient un bloc.
      for (const [, celluleXml] of element.matchAll(/<w:tc>([\s\S]*?)<\/w:tc>/g)) {
        const fragments: Fragment[] = [];
        for (const [, p] of celluleXml.matchAll(/<w:p(?: [^>]*)?>([\s\S]*?)<\/w:p>/g)) {
          const f = fragmentsDe(p);
          if (f.length > 0) {
            if (fragments.length > 0) fragments.push({ texte: "\n", gras: false, taille: TAILLE_PAR_DEFAUT });
            fragments.push(...f);
          }
        }
        if (fragments.length > 0) blocs.push({ genre: "encadre", fragments });
      }
      continue;
    }
    const fragments = fragmentsDe(element);
    const { taille, centre } = tailleEtAlignement(element, fragments);
    if (fragments.length === 0) blocs.push({ genre: "espace" });
    else blocs.push({ genre: "paragraphe", fragments, taille, centre });
  }
  return blocs;
}

/// Convertit un document Word en PDF. La signature de l'organisme, si elle
/// existe, est apposée à la suite du texte : dans une convention, c'est
/// exactement là que se trouve le bloc de signature.
export async function docxVersPdf(
  docx: Uint8Array,
  titre: string,
  signature?: { octets: Uint8Array; typeMime: string } | null,
): Promise<Uint8Array> {
  const fichiers = unzipSync(docx);
  const xml = decoder.decode(fichiers["word/document.xml"]);
  const blocs = blocsDuDocument(xml);

  const pdf = await PDFDocument.create();
  pdf.setTitle(titre);
  pdf.setProducer("Formalogy OS");
  pdf.setCreator("Formalogy OS");
  // Dates fixes : régénérer un document inchangé doit produire le même
  // fichier, sinon chaque génération créerait une version de plus.
  pdf.setCreationDate(new Date(0));
  pdf.setModificationDate(new Date(0));

  const normale = await pdf.embedFont(StandardFonts.Helvetica);
  const grasse = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage([A4.largeur, A4.hauteur]);
  let y = A4.hauteur - MARGE;

  const nouvellePage = () => {
    page = pdf.addPage([A4.largeur, A4.hauteur]);
    y = A4.hauteur - MARGE;
  };
  const placePour = (hauteur: number) => {
    if (y - hauteur < MARGE) nouvellePage();
  };

  for (const bloc of blocs) {
    if (bloc.genre === "espace") {
      y -= 6;
      continue;
    }

    const encadre = bloc.genre === "encadre";
    const taille = encadre ? Math.max(...bloc.fragments.map((f) => f.taille)) : bloc.taille;
    const interligne = taille * 1.45;
    const marge = encadre ? 8 : 0;
    const largeur = LARGEUR_UTILE - 2 * marge;

    // Le texte du bloc, fragment par fragment, découpé en lignes.
    const lignes: Fragment[][] = [[]];
    for (const fragment of bloc.fragments) {
      const police = fragment.gras ? grasse : normale;
      for (const [index, partie] of fragment.texte.split("\n").entries()) {
        if (index > 0) lignes.push([]);
        for (const [i, ligne] of lignesDe(police, partie, taille, largeur).entries()) {
          if (i > 0) lignes.push([]);
          if (ligne) lignes[lignes.length - 1].push({ ...fragment, texte: ligne });
        }
      }
    }

    const hauteur = Math.max(lignes.length, 1) * interligne + (encadre ? 10 : 0);
    placePour(hauteur);

    if (encadre) {
      page.drawRectangle({
        x: MARGE,
        y: y - hauteur + 4,
        width: LARGEUR_UTILE,
        height: hauteur,
        color: rgb(0.957, 0.969, 0.98),
        borderColor: rgb(0.86, 0.89, 0.92),
        borderWidth: 0.6,
      });
    }

    for (const ligne of lignes) {
      const largeurLigne = ligne.reduce(
        (total, f) => total + (f.gras ? grasse : normale).widthOfTextAtSize(texteSur(f.gras ? grasse : normale, f.texte), taille),
        0,
      );
      let x = MARGE + marge;
      if (!encadre && bloc.genre === "paragraphe" && bloc.centre) x = (A4.largeur - largeurLigne) / 2;

      for (const fragment of ligne) {
        const police = fragment.gras ? grasse : normale;
        const texte = texteSur(police, fragment.texte);
        page.drawText(texte, {
          x,
          y: y - interligne + 4,
          size: taille,
          font: police,
          color: couleurDe(fragment.couleur),
        });
        x += police.widthOfTextAtSize(texte, taille);
      }
      y -= interligne;
    }
    if (encadre) y -= 8;
  }

  // Signature de l'organisme, à la suite du texte. Une image illisible ne
  // fait jamais échouer la production du document.
  if (signature) {
    try {
      const dessin =
        signature.typeMime === "image/png" ? await pdf.embedPng(signature.octets) : await pdf.embedJpg(signature.octets);
      const largeur = 170;
      const hauteur = (dessin.height / dessin.width) * largeur;
      placePour(hauteur + 16);
      page.drawImage(dessin, { x: MARGE, y: y - hauteur - 8, width: largeur, height: hauteur });
    } catch {
      console.error("Signature de l'organisme illisible : convention produite sans elle.");
    }
  }

  return pdf.save();
}

/// Couleur d'un fragment. Les couleurs très claires sont assombries : un
/// texte pensé pour l'écran doit rester lisible une fois imprimé.
function couleurDe(hex?: string) {
  if (!hex) return rgb(0.2, 0.28, 0.36);
  const composantes = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
  const luminosite = 0.299 * composantes[0] + 0.587 * composantes[1] + 0.114 * composantes[2];
  if (luminosite > 0.75) return rgb(composantes[0] * 0.6, composantes[1] * 0.6, composantes[2] * 0.6);
  return rgb(...composantes);
}
