import "server-only";

import { PDFDocument, rgb, StandardFonts, type PDFPage } from "pdf-lib";

import { joursDeSession } from "@/lib/emargement";
import type { sessionPourEmargement } from "@/lib/emargement-acces";
import { tronquer } from "@/lib/pdf-outils";

type Session = NonNullable<Awaited<ReturnType<typeof sessionPourEmargement>>>;

// A4 paysage, en points
const LARGEUR = 841.89;
const HAUTEUR = 595.28;
const MARGE = 36;
const HAUTEUR_LIGNE = 34;
/// Laisse la place aux cases du formateur en bas de page
const LIGNES_PAR_PAGE = 10;
const NOIR = rgb(0.12, 0.14, 0.16);
const GRIS = rgb(0.45, 0.47, 0.5);
const TRAIT = rgb(0.75, 0.77, 0.8);

const COLONNES = [
  { titre: "Apprenant", largeur: 230 },
  { titre: "Entreprise", largeur: 190 },
  { titre: "Matin — signature", largeur: 175 },
  { titre: "Après-midi — signature", largeur: 174.89 },
];

const dateLongue = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/// Feuilles d'émargement pré-remplies : une page par jour de session (plus
/// des pages de suite si les apprenants ne tiennent pas sur une page), avec
/// une case de signature par apprenant et par demi-journée, et les cases du
/// formateur en bas de chaque jour.
export async function genererFeuillesEmargement(session: Session, organisme: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Émargement ${session.numero}`);
  pdf.setCreator("Formalogy OS");
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const gras = await pdf.embedFont(StandardFonts.HelveticaBold);

  const ecrire = (page: PDFPage, texte: string, x: number, y: number, taille: number, police = normal, couleur = NOIR, largeurMax = LARGEUR - 2 * MARGE) =>
    page.drawText(tronquer(police, texte, taille, largeurMax), { x, y, size: taille, font: police, color: couleur });

  const apprenants = session.inscriptions.map((i) => i.learner);
  const formateur = session.trainer ? `${session.trainer.prenom} ${session.trainer.nom}` : "non renseigné";
  const jours = joursDeSession(session.dateDebut, session.dateFin);

  for (const jour of jours) {
    // Au moins une page par jour, même sans inscrit (feuille vierge à compléter).
    const paquets: (typeof apprenants)[] = [];
    for (let i = 0; i < Math.max(apprenants.length, 1); i += LIGNES_PAR_PAGE) {
      paquets.push(apprenants.slice(i, i + LIGNES_PAR_PAGE));
    }

    paquets.forEach((paquet, rangPage) => {
      const page = pdf.addPage([LARGEUR, HAUTEUR]);
      let y = HAUTEUR - MARGE - 4;

      ecrire(page, organisme, MARGE, y, 10, gras, GRIS);
      ecrire(page, `Session ${session.numero}`, LARGEUR - MARGE - 150, y, 10, normal, GRIS, 150);
      y -= 24;
      ecrire(page, `Feuille d'émargement — ${dateLongue.format(jour)}${rangPage > 0 ? " (suite)" : ""}`, MARGE, y, 16, gras);
      y -= 20;
      ecrire(page, session.formation.titre, MARGE, y, 11.5, gras);
      y -= 16;
      const infos = [
        `Formateur : ${formateur}`,
        session.horaires ? `Horaires : ${session.horaires}` : null,
        session.lieu ? `Lieu : ${session.lieu}` : null,
        session.company ? `Client : ${session.company.raisonSociale}` : null,
      ].filter(Boolean).join("   ·   ");
      ecrire(page, infos, MARGE, y, 9.5, normal, GRIS);
      y -= 22;

      // En-tête du tableau
      let x = MARGE;
      page.drawRectangle({ x: MARGE, y: y - 6, width: LARGEUR - 2 * MARGE, height: 20, color: rgb(0.94, 0.95, 0.96) });
      for (const col of COLONNES) {
        ecrire(page, col.titre, x + 6, y, 9, gras, GRIS, col.largeur - 12);
        x += col.largeur;
      }
      y -= 6;

      const lignes = paquet.length > 0 ? paquet : [null];
      for (const apprenant of lignes) {
        const haut = y;
        y -= HAUTEUR_LIGNE;
        x = MARGE;
        COLONNES.forEach((col, i) => {
          page.drawRectangle({ x, y, width: col.largeur, height: HAUTEUR_LIGNE, borderColor: TRAIT, borderWidth: 0.6 });
          if (apprenant && i === 0) ecrire(page, `${apprenant.nom.toUpperCase()} ${apprenant.prenom}`, x + 6, haut - 20, 10, normal, NOIR, col.largeur - 12);
          if (apprenant && i === 1) ecrire(page, apprenant.company?.raisonSociale ?? "", x + 6, haut - 20, 9, normal, GRIS, col.largeur - 12);
          x += col.largeur;
        });
      }

      // Cases du formateur, en bas de la dernière page du jour
      if (rangPage === paquets.length - 1) {
        y -= 30;
        ecrire(page, `Signature du formateur (${formateur})`, MARGE, y, 9.5, gras);
        y -= 8;
        const debutCases = MARGE + COLONNES[0].largeur + COLONNES[1].largeur;
        ["Matin", "Après-midi"].forEach((libelle, i) => {
          const xc = debutCases + i * COLONNES[2].largeur;
          page.drawRectangle({ x: xc, y: y - 44, width: COLONNES[2 + i].largeur, height: 44, borderColor: TRAIT, borderWidth: 0.6 });
          ecrire(page, libelle, xc + 6, y - 12, 8.5, normal, GRIS);
        });
      }

      ecrire(
        page,
        "Chaque apprenant signe au début de chaque demi-journée. En cas d'absence, laisser la case vide et l'indiquer au formateur.",
        MARGE,
        MARGE - 12,
        8,
        normal,
        GRIS,
      );
    });
  }

  return pdf.save();
}
