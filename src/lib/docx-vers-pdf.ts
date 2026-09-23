import "server-only";

import { unzipSync } from "fflate";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import { texteSur } from "@/lib/pdf-outils";

// ---------------------------------------------------------------------------
// Mise en page d'un document Word en PDF, sans outil extérieur.
//
// Le choix : plutôt que d'installer LibreOffice (impossible sur un hébergement
// sans serveur) ou d'envoyer le document à un service de conversion (coût, et
// données d'apprenants qui sortent), on lit la structure du document Word et
// on la compose ici. Les conventions de Formalogy n'ont pas d'image et
// n'utilisent les tableaux que pour des couples « intitulé / valeur » : cette
// structure-là se restitue proprement.
//
// Ce qui n'est PAS repris : images, colonnes multiples, tableaux de plus de
// deux colonnes, polices personnalisées.
// ---------------------------------------------------------------------------

const A4 = { largeur: 595.28, hauteur: 841.89 };
const MARGE = { gauche: 64, droite: 64, haut: 70, bas: 78 };
const LARGEUR_UTILE = A4.largeur - MARGE.gauche - MARGE.droite;
/// Colonne des intitulés dans les couples « intitulé / valeur ».
const COLONNE_INTITULE = 168;
const TAILLE_CORPS = 10.5;
const INTERLIGNE = 1.55;
/// Air laissé après un paragraphe, et au-dessus d'un titre. Un document
/// juridique se lit mal sans respiration : c'est ce qui manquait le plus.
const APRES_PARAGRAPHE = 9;
const AVANT_TITRE = 20;
const APRES_TITRE = 9;

const ENCRE = rgb(0.13, 0.2, 0.29);
const ENCRE_DOUCE = rgb(0.38, 0.45, 0.53);
const FILET = rgb(0.85, 0.88, 0.91);

const DATE_FIXE = new Date(Date.UTC(1980, 0, 1));

type Fragment = { texte: string; gras: boolean; couleur?: string; taille: number };
type Bloc =
  | { genre: "paragraphe"; fragments: Fragment[]; taille: number; centre: boolean }
  | { genre: "caracteristique"; intitule: Fragment[]; valeur: Fragment[] }
  | { genre: "encadre"; fragments: Fragment[] }
  | { genre: "trait" }
  | { genre: "espace" };

const decoder = new TextDecoder();

/// Mentions légales du pied de page du modèle Word (SIRET, NDA, Qualiopi).
/// Word les place hors du corps : sans cette lecture, elles disparaîtraient
/// du document produit.
function mentionsLegales(fichiers: Record<string, Uint8Array>): string | null {
  const nom = Object.keys(fichiers).find((n) => /^word\/footer\d*\.xml$/.test(n));
  if (!nom) return null;
  const xml = decoder.decode(fichiers[nom]);
  const texte = [...xml.matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>/g)].map(([, t]) => texteXml(t)).join("");
  const propre = nettoyer(texte).trim();
  return propre.length > 0 ? propre : null;
}

function texteXml(valeur: string): string {
  return valeur
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/// Les pictogrammes (⚠, emoji) n'existent pas dans les polices standard des
/// PDF : mieux vaut les retirer qu'afficher un « ? » au milieu d'un contrat.
const nettoyer = (texte: string) => texte.replace(/[←-⯿️\u{1F000}-\u{1FAFF}]/gu, "").replace(/ {2,}/g, " ");

/// Word exprime la taille en demi-points (« 32 » = 16 pt) : c'est là qu'elle
/// se trouve réellement, ces modèles n'utilisant aucun style de titre nommé.
function fragmentsDe(xmlParagraphe: string): Fragment[] {
  const fragments: Fragment[] = [];
  for (const [, runXml] of xmlParagraphe.matchAll(/<w:r(?: [^>]*)?>([\s\S]*?)<\/w:r>/g)) {
    const proprietes = /<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(runXml)?.[1] ?? "";
    const gras = /<w:b\/>|<w:b [^>]*\/>/.test(proprietes);
    const couleur = /<w:color w:val="([0-9A-Fa-f]{6})"/.exec(proprietes)?.[1];
    const demiPoints = Number(/<w:sz w:val="(\d+)"/.exec(proprietes)?.[1]);
    const taille = Number.isFinite(demiPoints) && demiPoints > 0 ? demiPoints / 2 : TAILLE_CORPS;

    let texte = "";
    for (const [, t] of runXml.replace(/<w:br\/>/g, "<w:t>\n</w:t>").matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>/g)) {
      texte += texteXml(t);
    }
    texte = nettoyer(texte);
    if (texte) fragments.push({ texte, gras, couleur, taille });
  }
  return fragments;
}

const fragmentsDeCellule = (celluleXml: string): Fragment[] =>
  [...celluleXml.matchAll(/<w:p(?: [^>]*)?>([\s\S]*?)<\/w:p>/g)].flatMap(([, p], index) => {
    const f = fragmentsDe(p);
    return f.length > 0 && index > 0 ? [{ texte: "\n", gras: false, taille: TAILLE_CORPS }, ...f] : f;
  });

function blocsDuDocument(xml: string): Bloc[] {
  const corps = /<w:body>([\s\S]*)<\/w:body>/.exec(xml)?.[1] ?? xml;
  const blocs: Bloc[] = [];

  for (const [element] of corps.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>|<w:p(?: [^>]*)?>[\s\S]*?<\/w:p>|<w:p(?: [^>]*)?\/>/g)) {
    if (element.startsWith("<w:tbl>")) {
      for (const [, ligneXml] of element.matchAll(/<w:tr[ >]([\s\S]*?)<\/w:tr>/g)) {
        const cellules = [...ligneXml.matchAll(/<w:tc>([\s\S]*?)<\/w:tc>/g)].map(([, c]) => fragmentsDeCellule(c));
        // Deux cellules : un couple « intitulé / valeur », présenté comme tel.
        // Une seule : un encadré de texte.
        if (cellules.length >= 2 && cellules[0].length > 0) {
          blocs.push({ genre: "caracteristique", intitule: cellules[0], valeur: cellules.slice(1).flat() });
        } else if (cellules[0]?.length > 0) {
          blocs.push({ genre: "encadre", fragments: cellules[0] });
        }
      }
      continue;
    }
    const fragments = fragmentsDe(element);
    if (fragments.length === 0) {
      blocs.push({ genre: "espace" });
      continue;
    }
    // «TRAIT» seul sur sa ligne : un filet de séparation, à placer librement
    // dans le modèle Word.
    if (fragments.map((f) => f.texte).join("").trim() === "«TRAIT»") {
      blocs.push({ genre: "trait" });
      continue;
    }
    blocs.push({
      genre: "paragraphe",
      fragments,
      taille: Math.max(...fragments.map((f) => f.taille)),
      centre: /<w:jc w:val="center"/.test(element),
    });
  }
  return blocs;
}

// ---------------------------------------------------------------------------
// Composition : découpage en lignes, mot par mot, en gardant la mise en forme
// de chaque mot. Découper à l'avance permet de savoir combien de place un
// bloc réclame, donc de ne jamais couper un titre de ce qui le suit.
// ---------------------------------------------------------------------------

type Mot = { texte: string; police: PDFFont; taille: number; couleur: ReturnType<typeof rgb> };
type Ligne = { mots: Mot[]; derniere: boolean };

function couleurDe(hex?: string) {
  if (!hex) return ENCRE;
  const [r, v, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  // Une couleur claire, pensée pour l'écran, devient illisible à l'impression.
  const luminosite = 0.299 * r + 0.587 * v + 0.114 * b;
  return luminosite > 0.72 ? rgb(r * 0.6, v * 0.6, b * 0.6) : rgb(r, v, b);
}

function composer(fragments: Fragment[], largeur: number, polices: { normale: PDFFont; grasse: PDFFont }): Ligne[] {
  const lignes: Ligne[] = [{ mots: [], derniere: false }];
  let largeurCourante = 0;

  const ajouterLigne = (derniere: boolean) => {
    lignes[lignes.length - 1].derniere = derniere;
    lignes.push({ mots: [], derniere: false });
    largeurCourante = 0;
  };

  for (const fragment of fragments) {
    const police = fragment.gras ? polices.grasse : polices.normale;
    const couleur = couleurDe(fragment.couleur);
    const largeurEspace = police.widthOfTextAtSize(" ", fragment.taille);

    for (const [index, paragraphe] of fragment.texte.split("\n").entries()) {
      if (index > 0) ajouterLigne(true);
      for (const mot of paragraphe.split(" ").filter((m) => m !== "")) {
        const rendu = texteSur(police, mot);
        const largeurMot = police.widthOfTextAtSize(rendu, fragment.taille);
        const separation = lignes[lignes.length - 1].mots.length > 0 ? largeurEspace : 0;
        if (largeurCourante + separation + largeurMot > largeur && lignes[lignes.length - 1].mots.length > 0) {
          ajouterLigne(false);
        }
        const espace = lignes[lignes.length - 1].mots.length > 0 ? largeurEspace : 0;
        lignes[lignes.length - 1].mots.push({ texte: rendu, police, taille: fragment.taille, couleur });
        largeurCourante += espace + largeurMot;
      }
    }
  }

  lignes[lignes.length - 1].derniere = true;
  return lignes.filter((l) => l.mots.length > 0);
}

const largeurLigne = (ligne: Ligne) =>
  ligne.mots.reduce((total, m, i) => total + m.police.widthOfTextAtSize(m.texte, m.taille) + (i > 0 ? m.police.widthOfTextAtSize(" ", m.taille) : 0), 0);

function dessinerLigne(page: PDFPage, ligne: Ligne, x: number, y: number, largeur: number, justifier: boolean) {
  const naturelle = largeurLigne(ligne);
  const espaces = ligne.mots.length - 1;
  // Une ligne n'est étirée que si elle l'est raisonnablement : au-delà, mieux
  // vaut un bord droit irrégulier que des mots flottants.
  const etirement = justifier && espaces > 0 && naturelle > largeur * 0.8 ? (largeur - naturelle) / espaces : 0;

  let curseur = x;
  for (const [index, mot] of ligne.mots.entries()) {
    if (index > 0) curseur += mot.police.widthOfTextAtSize(" ", mot.taille) + etirement;
    page.drawText(mot.texte, { x: curseur, y, size: mot.taille, font: mot.police, color: mot.couleur });
    curseur += mot.police.widthOfTextAtSize(mot.texte, mot.taille);
  }
}

// ---------------------------------------------------------------------------

export async function docxVersPdf(
  docx: Uint8Array,
  titre: string,
  signature?: { octets: Uint8Array; typeMime: string } | null,
): Promise<Uint8Array> {
  const fichiers = unzipSync(docx);
  const blocs = blocsDuDocument(decoder.decode(fichiers["word/document.xml"]));
  const mentions = mentionsLegales(fichiers);

  const pdf = await PDFDocument.create();
  pdf.setTitle(titre);
  pdf.setProducer("Formalogy OS");
  pdf.setCreator("Formalogy OS");
  // Dates fixes : régénérer un document inchangé doit produire le même
  // fichier, sinon chaque génération créerait une version de plus.
  pdf.setCreationDate(DATE_FIXE);
  pdf.setModificationDate(DATE_FIXE);

  const polices = {
    normale: await pdf.embedFont(StandardFonts.Helvetica),
    grasse: await pdf.embedFont(StandardFonts.HelveticaBold),
  };

  let page = pdf.addPage([A4.largeur, A4.hauteur]);
  let y = A4.hauteur - MARGE.haut;
  const nouvellePage = () => {
    page = pdf.addPage([A4.largeur, A4.hauteur]);
    y = A4.hauteur - MARGE.haut;
  };
  const placePour = (hauteur: number) => {
    if (y - hauteur < MARGE.bas) nouvellePage();
  };

  for (const [index, bloc] of blocs.entries()) {
    if (bloc.genre === "espace") {
      y -= 5;
      continue;
    }

    if (bloc.genre === "trait") {
      placePour(24);
      y -= 10;
      page.drawLine({
        start: { x: MARGE.gauche, y },
        end: { x: A4.largeur - MARGE.droite, y },
        thickness: 0.8,
        color: FILET,
      });
      y -= 14;
      continue;
    }

    if (bloc.genre === "caracteristique") {
      const largeurValeur = LARGEUR_UTILE - COLONNE_INTITULE;
      const lignesIntitule = composer(bloc.intitule, COLONNE_INTITULE - 12, polices);
      const lignesValeur = composer(bloc.valeur, largeurValeur, polices);
      const pas = TAILLE_CORPS * INTERLIGNE;
      const hauteur = Math.max(lignesIntitule.length, lignesValeur.length) * pas + 12;
      placePour(hauteur);

      const haut = y;
      let yIntitule = haut - pas + 3;
      for (const ligne of lignesIntitule) {
        dessinerLigne(page, { ...ligne, mots: ligne.mots.map((m) => ({ ...m, taille: 8.5, couleur: ENCRE_DOUCE, police: polices.grasse })) }, MARGE.gauche, yIntitule, COLONNE_INTITULE, false);
        yIntitule -= pas;
      }
      let yValeur = haut - pas + 3;
      for (const ligne of lignesValeur) {
        dessinerLigne(page, { ...ligne, mots: ligne.mots.map((m) => ({ ...m, taille: TAILLE_CORPS })) }, MARGE.gauche + COLONNE_INTITULE, yValeur, largeurValeur, false);
        yValeur -= pas;
      }
      y = haut - hauteur;
      // Filet de séparation, sauf après la dernière caractéristique d'une suite.
      if (blocs[index + 1]?.genre === "caracteristique") {
        page.drawLine({ start: { x: MARGE.gauche, y: y + 6 }, end: { x: A4.largeur - MARGE.droite, y: y + 6 }, thickness: 0.5, color: FILET });
      } else {
        y -= APRES_PARAGRAPHE;
      }
      continue;
    }

    if (bloc.genre === "encadre") {
      const lignes = composer(bloc.fragments, LARGEUR_UTILE - 32, polices);
      const pas = TAILLE_CORPS * INTERLIGNE;
      const hauteur = lignes.length * pas + 24;
      placePour(hauteur + APRES_PARAGRAPHE);
      page.drawRectangle({
        x: MARGE.gauche,
        y: y - hauteur,
        width: LARGEUR_UTILE,
        height: hauteur,
        color: rgb(0.965, 0.976, 0.984),
        borderColor: FILET,
        borderWidth: 0.6,
      });
      let yLigne = y - pas - 6;
      for (const ligne of lignes) {
        dessinerLigne(page, ligne, MARGE.gauche + 16, yLigne, LARGEUR_UTILE - 32, false);
        yLigne -= pas;
      }
      y -= hauteur + APRES_PARAGRAPHE;
      continue;
    }

    // Paragraphe courant ou titre.
    const titreDeSection = bloc.taille > TAILLE_CORPS + 0.5;
    const lignes = composer(bloc.fragments, LARGEUR_UTILE, polices);
    const pas = bloc.taille * (titreDeSection ? 1.3 : INTERLIGNE);
    const hauteur = lignes.length * pas;

    if (titreDeSection) {
      y -= AVANT_TITRE;
      // Un titre ne reste jamais seul en bas d'une page : on réserve la place
      // du titre et des premières lignes de ce qui le suit.
      placePour(hauteur + 3 * TAILLE_CORPS * INTERLIGNE);
    } else {
      placePour(Math.min(hauteur, 2 * pas));
    }

    for (const ligne of lignes) {
      const largeur = largeurLigne(ligne);
      const x = bloc.centre ? MARGE.gauche + (LARGEUR_UTILE - largeur) / 2 : MARGE.gauche;
      // Texte courant justifié : c'est la mise en page attendue d'un contrat.
      dessinerLigne(page, ligne, x, y - pas + 3, LARGEUR_UTILE, !bloc.centre && !titreDeSection && !ligne.derniere);
      y -= pas;
      if (y < MARGE.bas) nouvellePage();
    }
    y -= titreDeSection ? APRES_TITRE : APRES_PARAGRAPHE;
  }

  if (signature) await apposerSignature(pdf, page, y, signature);
  piedsDePage(pdf, polices.normale, mentions ?? titre);

  return pdf.save();
}

async function apposerSignature(
  pdf: PDFDocument,
  page: PDFPage,
  y: number,
  signature: { octets: Uint8Array; typeMime: string },
) {
  try {
    const dessin =
      signature.typeMime === "image/png" ? await pdf.embedPng(signature.octets) : await pdf.embedJpg(signature.octets);
    const largeur = 185;
    const hauteur = (dessin.height / dessin.width) * largeur;
    // Si la place manque en bas de page, la signature passe sur la suivante
    // plutôt que de chevaucher le texte.
    const cible = y - hauteur - 14 < MARGE.bas ? pdf.addPage([A4.largeur, A4.hauteur]) : page;
    const yImage = cible === page ? y - hauteur - 14 : A4.hauteur - MARGE.haut - hauteur;
    cible.drawImage(dessin, { x: MARGE.gauche, y: yImage, width: largeur, height: hauteur });
  } catch {
    console.error("Signature de l'organisme illisible : document produit sans elle.");
  }
}

/// Mentions légales et numérotation en bas de chaque page. Sur un contrat de
/// plusieurs pages, savoir qu'il n'en manque aucune a son importance.
function piedsDePage(pdf: PDFDocument, police: PDFFont, mentions: string) {
  const pages = pdf.getPages();
  const taille = 7.5;
  const centre = (page: PDFPage, texte: string, y: number) => {
    const rendu = texteSur(police, texte);
    page.drawText(rendu, {
      x: (A4.largeur - police.widthOfTextAtSize(rendu, taille)) / 2,
      y,
      size: taille,
      font: police,
      color: ENCRE_DOUCE,
    });
  };

  for (const [index, page] of pages.entries()) {
    const y = MARGE.bas - 40;
    page.drawLine({
      start: { x: MARGE.gauche, y: y + 22 },
      end: { x: A4.largeur - MARGE.droite, y: y + 22 },
      thickness: 0.5,
      color: FILET,
    });
    centre(page, mentions, y + 11);
    centre(page, `Page ${index + 1} / ${pages.length}`, y);
  }
}
