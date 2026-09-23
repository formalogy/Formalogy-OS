import "server-only";

import { unzipSync, zipSync } from "fflate";

/// Marqueur de publipostage tel que Word l'écrit : «NOM_STAGIAIRE».
/// Les guillemets français font partie du marqueur.
const MARQUEUR = /«([A-Z_0-9]+)»/g;

/// Parties d'un .docx où du texte visible peut se trouver : le corps, mais
/// aussi les en-têtes et pieds de page, où l'on met souvent la référence du
/// programme ou le nom de l'organisme.
const PARTIES_TEXTE = /^word\/(document|header\d*|footer\d*)\.xml$/;

const DATE_FIXE = new Date(Date.UTC(1980, 0, 1));

/// Dans un document Word, le texte est découpé en fragments (« runs ») que
/// Word scinde librement — au milieu d'un mot s'il le veut. Un marqueur peut
/// donc se retrouver coupé en deux fragments voisins, ce qui mettrait en
/// échec un simple remplacement. On recolle d'abord les fragments qui se
/// suivent et partagent la même mise en forme.
function recollerFragments(xml: string): string {
  // </w:t></w:r><w:r><w:rPr>…</w:rPr><w:t> : fin d'un fragment immédiatement
  // suivie du début du suivant, sans rien de visible entre les deux.
  return xml.replace(/<\/w:t>\s*<\/w:r>\s*<w:r>(?:<w:rPr>.*?<\/w:rPr>)?\s*<w:t(?: [^>]*)?>/g, "");
}

function echapperXml(valeur: string): string {
  return valeur
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "</w:t><w:br/><w:t>");
}

export type ResultatRemplissage = {
  octets: Uint8Array;
  /// Marqueurs présents dans le modèle mais laissés tels quels, faute de
  /// valeur. Ils restent visibles dans le document : mieux vaut un « trou »
  /// qui se voit qu'un blanc silencieux dans une convention signée.
  nonRemplis: string[];
};

/// Remplit un modèle .docx en remplaçant chaque «MARQUEUR» par sa valeur.
export function remplirModeleDocx(modele: Uint8Array, valeurs: Record<string, string | undefined>): ResultatRemplissage {
  const fichiers = unzipSync(modele);
  const nonRemplis = new Set<string>();
  const decodeur = new TextDecoder();
  const encodeur = new TextEncoder();

  for (const nom of Object.keys(fichiers)) {
    if (!PARTIES_TEXTE.test(nom)) continue;
    const xml = recollerFragments(decodeur.decode(fichiers[nom]));
    const rempli = xml.replace(MARQUEUR, (marqueur, cle: string) => {
      const valeur = valeurs[cle];
      if (valeur === undefined || valeur === "") {
        nonRemplis.add(cle);
        return marqueur;
      }
      return echapperXml(valeur);
    });
    fichiers[nom] = encodeur.encode(rempli);
  }

  // Date fixe : régénérer une convention inchangée doit produire un fichier
  // identique à l'octet près, sinon chaque génération créerait une version de
  // plus. (Le format ZIP n'accepte que 1980-2099, d'où cette date-là.)
  return { octets: zipSync(fichiers, { mtime: DATE_FIXE }), nonRemplis: [...nonRemplis].sort() };
}

/// Marqueurs présents dans un modèle, pour dire à l'utilisateur ce que son
/// document attend avant même de l'utiliser.
export function marqueursDuModele(modele: Uint8Array): string[] {
  const fichiers = unzipSync(modele);
  const decodeur = new TextDecoder();
  const trouves = new Set<string>();
  for (const nom of Object.keys(fichiers)) {
    if (!PARTIES_TEXTE.test(nom)) continue;
    for (const [, cle] of recollerFragments(decodeur.decode(fichiers[nom])).matchAll(MARQUEUR)) trouves.add(cle);
  }
  return [...trouves].sort();
}
