import "server-only";

import type { ResultatAcquis } from "@prisma/client";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";

import { texteFormationVersBrut } from "@/lib/formations-assainir";
import type { lireOrganisme } from "@/lib/organisme";
import { lignesDe, texteSur } from "@/lib/pdf-outils";

type Organisme = Awaited<ReturnType<typeof lireOrganisme>>;

export type DonneesAttestation = {
  organisme: Organisme;
  apprenant: { prenom: string; nom: string };
  entreprise: string | null;
  formation: { titre: string; objectifs: string | null };
  session: { numero: string; dateDebut: Date; dateFin: Date; lieu: string | null; modaliteLibelle: string };
  heuresPrevues: number;
  heuresRealisees: number;
  resultat: ResultatAcquis;
  commentaire: string | null;
  /// Date d'établissement : la fin de session, pour qu'un même document
  /// régénéré plus tard reste identique.
  etabliLe: Date;
  /// Signature de l'organisme, apposée dans le cadre prévu. Absente tant
  /// qu'aucune image n'a été déposée dans Paramètres → Organisme.
  signature?: { octets: Uint8Array; typeMime: string } | null;
  /// Logo repris en tête du document.
  logo?: { octets: Uint8Array; typeMime: string } | null;
};

export const LIBELLE_RESULTAT: Record<ResultatAcquis, string> = {
  ACQUIS: "Acquis",
  PARTIELLEMENT_ACQUIS: "Partiellement acquis",
  NON_ACQUIS: "Non acquis",
};

// A4 portrait, en points
const LARGEUR = 595.28;
const HAUTEUR = 841.89;
const MARGE = 56;
const NOIR = rgb(0.12, 0.14, 0.16);
const GRIS = rgb(0.42, 0.45, 0.48);
const TRAIT = rgb(0.78, 0.8, 0.83);

const date = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const heures = (h: number) => `${h.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} heure${h > 1 ? "s" : ""}`;

class Redaction {
  y = HAUTEUR - MARGE;
  constructor(
    readonly page: PDFPage,
    readonly normal: PDFFont,
    readonly gras: PDFFont,
  ) {}

  texte(t: string, { taille = 10.5, police = this.normal, couleur = NOIR, interligne = 1.45, retrait = 0 } = {}) {
    for (const ligne of lignesDe(police, t, taille, LARGEUR - 2 * MARGE - retrait)) {
      this.page.drawText(ligne, { x: MARGE + retrait, y: this.y, size: taille, font: police, color: couleur });
      this.y -= taille * interligne;
    }
  }

  /// Libellé en gras suivi de sa valeur sur la même ligne.
  champ(libelle: string, valeur: string) {
    const taille = 10.5;
    const debut = texteSur(this.gras, `${libelle} : `);
    const largeur = this.gras.widthOfTextAtSize(debut, taille);
    this.page.drawText(debut, { x: MARGE, y: this.y, size: taille, font: this.gras, color: NOIR });
    const lignes = lignesDe(this.normal, valeur, taille, LARGEUR - 2 * MARGE - largeur);
    lignes.forEach((ligne, i) => {
      this.page.drawText(ligne, { x: MARGE + largeur, y: this.y, size: taille, font: this.normal, color: NOIR });
      if (i < lignes.length - 1) this.y -= taille * 1.45;
    });
    this.y -= taille * 1.9;
  }

  espace(points: number) {
    this.y -= points;
  }

  filet() {
    this.page.drawLine({ start: { x: MARGE, y: this.y }, end: { x: LARGEUR - MARGE, y: this.y }, thickness: 0.6, color: TRAIT });
    this.y -= 18;
  }
}

async function nouveauDocument(titre: string, etabliLe: Date) {
  const pdf = await PDFDocument.create({ updateMetadata: false });
  // Métadonnées fixes : régénérer un document inchangé donne le même fichier,
  // ce qui évite de créer des versions identiques.
  pdf.setTitle(titre);
  pdf.setCreator("Formalogy OS");
  pdf.setProducer("Formalogy OS");
  pdf.setCreationDate(etabliLe);
  pdf.setModificationDate(etabliLe);
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const gras = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([LARGEUR, HAUTEUR]);
  return { pdf, r: new Redaction(page, normal, gras) };
}

/// Le logo s'il est déposé, le nom de l'organisme sinon. Un logo illisible
/// ne fait jamais échouer le document.
async function enTeteOrganisme(
  pdf: PDFDocument,
  r: Redaction,
  o: Organisme,
  logo?: { octets: Uint8Array; typeMime: string } | null,
) {
  let pose = false;
  if (logo) {
    try {
      const dessin = logo.typeMime === "image/png" ? await pdf.embedPng(logo.octets) : await pdf.embedJpg(logo.octets);
      const facteur = Math.min(170 / dessin.width, 44 / dessin.height);
      const hauteur = dessin.height * facteur;
      r.page.drawImage(dessin, {
        x: MARGE,
        y: r.y - hauteur,
        width: dessin.width * facteur,
        height: hauteur,
      });
      r.espace(hauteur + 8);
      pose = true;
    } catch {
      console.error("Logo de l'organisme illisible : document produit sans lui.");
    }
  }
  if (!pose) r.texte(o.raisonSociale, { taille: 12, police: r.gras });
  const lignes = [
    [o.adresse, [o.codePostal, o.ville].filter(Boolean).join(" ")].filter(Boolean).join(", "),
    o.siret ? `SIRET ${o.siret}` : null,
    o.numeroDeclaration ? `Déclaration d'activité n° ${o.numeroDeclaration} (cet enregistrement ne vaut pas agrément de l'État)` : null,
    [o.telephone, o.email].filter(Boolean).join(" · "),
  ].filter(Boolean) as string[];
  for (const l of lignes) r.texte(l, { taille: 8.5, couleur: GRIS, interligne: 1.35 });
  r.espace(26);
}

async function signature(
  pdf: PDFDocument,
  r: Redaction,
  o: Organisme,
  etabliLe: Date,
  image?: { octets: Uint8Array; typeMime: string } | null,
) {
  r.espace(14);
  r.texte(`Fait à ${o.ville ?? "…"}, le ${date.format(etabliLe)}`);
  r.espace(10);
  r.texte(`${o.representantNom ?? ""}${o.representantFonction ? `, ${o.representantFonction}` : ""}`, { police: r.gras });
  r.texte("Cachet et signature du responsable de l'organisme de formation", { taille: 9, couleur: GRIS });

  const cadre = { x: MARGE, y: r.y - 78, largeur: 230, hauteur: 72 };
  r.page.drawRectangle({ x: cadre.x, y: cadre.y, width: cadre.largeur, height: cadre.hauteur, borderColor: TRAIT, borderWidth: 0.6 });
  if (!image) return;

  // La signature est posée dans le cadre, à l'échelle, sans jamais le
  // déborder. Une image illisible ne fait pas échouer le document.
  try {
    const dessin = image.typeMime === "image/png" ? await pdf.embedPng(image.octets) : await pdf.embedJpg(image.octets);
    const marge = 6;
    const facteur = Math.min((cadre.largeur - 2 * marge) / dessin.width, (cadre.hauteur - 2 * marge) / dessin.height);
    const largeur = dessin.width * facteur;
    const hauteur = dessin.height * facteur;
    r.page.drawImage(dessin, {
      x: cadre.x + (cadre.largeur - largeur) / 2,
      y: cadre.y + (cadre.hauteur - hauteur) / 2,
      width: largeur,
      height: hauteur,
    });
  } catch {
    console.error("Signature de l'organisme illisible : document produit sans elle.");
  }
}

/// Attestation de fin de formation (article L6353-1 du Code du travail) :
/// objectifs, nature, durée et résultats de l'évaluation des acquis.
export async function genererAttestation(d: DonneesAttestation): Promise<Uint8Array> {
  const { pdf, r } = await nouveauDocument(`Attestation de fin de formation — ${d.apprenant.prenom} ${d.apprenant.nom}`, d.etabliLe);
  await enTeteOrganisme(pdf, r, d.organisme, d.logo);

  r.texte("ATTESTATION DE FIN DE FORMATION", { taille: 17, police: r.gras, interligne: 1.2 });
  r.texte("Article L6353-1 du Code du travail", { taille: 9, couleur: GRIS });
  r.espace(18);
  r.filet();

  r.texte(
    `${d.organisme.representantNom ?? "Le responsable"}${d.organisme.representantFonction ? `, ${d.organisme.representantFonction}` : ""} de ${d.organisme.raisonSociale}, atteste que :`,
  );
  r.espace(10);
  r.champ("Stagiaire", `${d.apprenant.prenom} ${d.apprenant.nom.toUpperCase()}`);
  if (d.entreprise) r.champ("Entreprise", d.entreprise);
  r.champ("A suivi la formation", d.formation.titre);
  r.champ("Nature de l'action", "Action de formation (article L6313-1 du Code du travail)");
  r.champ("Dates", `du ${date.format(d.session.dateDebut)} au ${date.format(d.session.dateFin)}`);
  r.champ("Modalité", `${d.session.modaliteLibelle}${d.session.lieu ? ` — ${d.session.lieu}` : ""}`);
  r.champ("Durée", `${heures(d.heuresPrevues)} prévues, ${heures(d.heuresRealisees)} suivies`);

  if (d.formation.objectifs) {
    r.texte("Objectifs de la formation :", { police: r.gras });
    for (const objectif of texteFormationVersBrut(d.formation.objectifs).split(/\r?\n/).map((o) => o.trim()).filter(Boolean)) {
      r.texte(`-  ${objectif.replace(/^[-•*]\s*/, "")}`, { taille: 10, retrait: 10, interligne: 1.4 });
    }
    r.espace(10);
  }

  r.champ("Résultat de l'évaluation des acquis", LIBELLE_RESULTAT[d.resultat]);
  if (d.commentaire) {
    r.espace(-6);
    r.texte(`Observations : ${d.commentaire}`, { taille: 10, couleur: GRIS });
    r.espace(8);
  }

  await signature(pdf, r, d.organisme, d.etabliLe, d.signature);
  r.page.drawText(texteSur(r.normal, `Session ${d.session.numero}`), { x: MARGE, y: 30, size: 8, font: r.normal, color: GRIS });
  return pdf.save();
}

/// Certificat de réalisation, reprenant le contenu du modèle établi par le
/// ministère du Travail et exigé par les financeurs (OPCO, CPF, France Travail).
export async function genererCertificatRealisation(d: DonneesAttestation): Promise<Uint8Array> {
  const { pdf, r } = await nouveauDocument(`Certificat de réalisation — ${d.apprenant.prenom} ${d.apprenant.nom}`, d.etabliLe);
  await enTeteOrganisme(pdf, r, d.organisme, d.logo);

  r.texte("CERTIFICAT DE RÉALISATION", { taille: 17, police: r.gras, interligne: 1.2 });
  r.espace(18);
  r.filet();

  r.texte(
    `Je soussigné(e) ${d.organisme.representantNom ?? "…"}, représentant légal du dispensateur de l'action concourant au développement des compétences ${d.organisme.raisonSociale}, atteste que :`,
  );
  r.espace(10);
  r.champ("Nom et prénom du bénéficiaire", `${d.apprenant.nom.toUpperCase()} ${d.apprenant.prenom}`);
  if (d.entreprise) r.champ("Salarié(e) de l'entreprise", d.entreprise);
  r.champ("A suivi l'action", d.formation.titre);
  r.champ("Nature de l'action concourant au développement des compétences", "Action de formation");
  r.champ("Qui s'est déroulée", `du ${date.format(d.session.dateDebut)} au ${date.format(d.session.dateFin)}`);
  r.champ("Pour une durée de", heures(d.heuresPrevues));
  r.champ("Assiduité du bénéficiaire (durée effectivement suivie)", heures(d.heuresRealisees));

  r.espace(6);
  r.texte(
    "Sans préjudice des délais imposés par les règles fiscales, comptables ou commerciales, je m'engage à conserver l'ensemble des pièces justificatives qui ont permis d'établir le présent certificat pendant une durée de 3 ans à compter de la fin de l'année du dernier paiement. En cas de cofinancement des fonds européens, la durée de conservation est étendue conformément aux obligations conventionnelles spécifiques.",
    { taille: 9.5, couleur: GRIS },
  );

  await signature(pdf, r, d.organisme, d.etabliLe, d.signature);
  r.page.drawText(texteSur(r.normal, `Session ${d.session.numero}`), { x: MARGE, y: 30, size: 8, font: r.normal, color: GRIS });
  return pdf.save();
}
