import "server-only";

import type { Creneau } from "@prisma/client";
import { PDFDocument, rgb, StandardFonts, type PDFImage, type PDFPage } from "pdf-lib";

import { demiJourneesJusqua, horairesDemiJournees, LIBELLE_CRENEAU, LIBELLE_PRESENCE } from "@/lib/emargement";
import type { sessionPourEmargement } from "@/lib/emargement-acces";
import { tronquer } from "@/lib/pdf-outils";
import { prisma } from "@/lib/prisma";

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
  { titre: "Signature", largeur: 349.89 },
];

const dateLongue = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const dateSignature = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Paris" });
const heureSignature = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

/// Feuilles d'émargement pré-remplies : une page par demi-journée (plus des
/// pages de suite si les apprenants ne tiennent pas sur une page), avec
/// l'horaire réel du créneau, une case de signature par apprenant et celle du
/// formateur en bas. Les signatures électroniques déjà recueillies y figurent,
/// avec leur heure ; une absence signalée est inscrite dans la case.
///
/// Seules les demi-journées déjà commencées sont produites : une feuille ne
/// se fait signer que le jour même, jamais à l'avance. `seulementCeJour` ne
/// garde que les deux demi-journées du jour (feuille envoyée au formateur
/// chaque matin de session) ; `jours` ne garde que les jours donnés (feuilles
/// manquantes renvoyées avec une relance).
export async function genererFeuillesEmargement(
  session: Session,
  organisme: string,
  aujourdhui: Date,
  options: { seulementCeJour?: boolean; jours?: Date[] } = {},
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Émargement ${session.numero}`);
  pdf.setCreator("Formalogy OS");
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const gras = await pdf.embedFont(StandardFonts.HelveticaBold);

  const ecrire = (page: PDFPage, texte: string, x: number, y: number, taille: number, police = normal, couleur = NOIR, largeurMax = LARGEUR - 2 * MARGE) =>
    page.drawText(tronquer(police, texte, taille, largeurMax), { x, y, size: taille, font: police, color: couleur });

  const apprenants = session.inscriptions.map((i) => i.learner);
  const formateur = session.trainer ? `${session.trainer.prenom} ${session.trainer.nom}` : "non renseigné";
  const horaires = horairesDemiJournees(session.horaires);
  const demiJournees = demiJourneesJusqua(session.dateDebut, session.dateFin, aujourdhui).filter(
    ({ jour }) =>
      (!options.seulementCeJour || jour.getTime() === aujourdhui.getTime()) &&
      (!options.jours || options.jours.some((j) => j.getTime() === jour.getTime())),
  );

  // Signatures électroniques des demi-journées produites, repérées par
  // « jour|créneau|participant ».
  const cle = (jour: Date, creneau: Creneau, participant: string) => `${jour.getTime()}|${creneau}|${participant}`;
  const signatures = new Map<string, { image: PDFImage; signeAt: Date }>();
  const recueillies = await prisma.signatureEmargement.findMany({
    where: { sessionId: session.id, jour: { in: [...new Set(demiJournees.map((d) => d.jour.getTime()))].map((t) => new Date(t)) } },
    select: { jour: true, creneau: true, image: true, signeAt: true, lien: { select: { learnerId: true, trainerId: true } } },
  });
  for (const s of recueillies) {
    const participant = s.lien.learnerId ? `apprenant:${s.lien.learnerId}` : `formateur:${s.lien.trainerId}`;
    signatures.set(cle(s.jour, s.creneau, participant), { image: await pdf.embedPng(s.image), signeAt: s.signeAt });
  }
  const absences = new Map(
    session.presences.filter((p) => p.statut !== "PRESENT").map((p) => [cle(p.jour, p.creneau, `apprenant:${p.learnerId}`), LIBELLE_PRESENCE[p.statut]]),
  );

  /// Signature dans sa case : l'image à gauche, l'heure à droite.
  const apposer = (page: PDFPage, signature: { image: PDFImage; signeAt: Date }, x: number, y: number, largeur: number, hauteur: number) => {
    const echelle = Math.min((hauteur - 6) / signature.image.height, 170 / signature.image.width);
    page.drawImage(signature.image, { x: x + 6, y: y + (hauteur - signature.image.height * echelle) / 2, width: signature.image.width * echelle, height: signature.image.height * echelle });
    ecrire(page, `Signé en ligne le ${dateSignature.format(signature.signeAt)} à ${heureSignature.format(signature.signeAt)}`, x + 186, y + hauteur / 2 - 3, 7.5, normal, GRIS, largeur - 192);
  };

  for (const { jour, creneau } of demiJournees) {
    // Au moins une page par jour, même sans inscrit (feuille vierge à compléter).
    const paquets: (typeof apprenants)[] = [];
    for (let i = 0; i < Math.max(apprenants.length, 1); i += LIGNES_PAR_PAGE) {
      paquets.push(apprenants.slice(i, i + LIGNES_PAR_PAGE));
    }

    paquets.forEach((paquet, rangPage) => {
      const page = pdf.addPage([LARGEUR, HAUTEUR]);
      let electronique = false;
      let y = HAUTEUR - MARGE - 4;

      ecrire(page, organisme, MARGE, y, 10, gras, GRIS);
      ecrire(page, `Session ${session.numero}`, LARGEUR - MARGE - 150, y, 10, normal, GRIS, 150);
      y -= 24;
      ecrire(
        page,
        `Émargement — ${LIBELLE_CRENEAU[creneau].toLowerCase()} du ${dateLongue.format(jour)}${rangPage > 0 ? " (suite)" : ""}`,
        MARGE,
        y,
        16,
        gras,
      );
      y -= 20;
      ecrire(page, session.formation.titre, MARGE, y, 11.5, gras);
      y -= 16;
      const infos = [
        `Formateur : ${formateur}`,
        horaires[creneau] ? `Horaire : ${horaires[creneau]}` : null,
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
          if (apprenant && i === 2) {
            const signature = signatures.get(cle(jour, creneau, `apprenant:${apprenant.id}`));
            const absence = absences.get(cle(jour, creneau, `apprenant:${apprenant.id}`));
            if (signature) {
              apposer(page, signature, x, y, col.largeur, HAUTEUR_LIGNE);
              electronique = true;
            } else if (absence) {
              ecrire(page, absence, x + 6, haut - 20, 9.5, gras, GRIS, col.largeur - 12);
            }
          }
          x += col.largeur;
        });
      }

      // Case du formateur, en bas de la dernière page de la demi-journée
      if (rangPage === paquets.length - 1) {
        y -= 30;
        ecrire(page, `Signature du formateur (${formateur})`, MARGE, y, 9.5, gras);
        y -= 8;
        const xc = MARGE + COLONNES[0].largeur + COLONNES[1].largeur;
        page.drawRectangle({ x: xc, y: y - 44, width: COLONNES[2].largeur, height: 44, borderColor: TRAIT, borderWidth: 0.6 });
        const signature = session.trainerId ? signatures.get(cle(jour, creneau, `formateur:${session.trainerId}`)) : undefined;
        if (signature) {
          apposer(page, signature, xc, y - 44, COLONNES[2].largeur, 44);
          electronique = true;
        }
      }

      ecrire(
        page,
        electronique
          ? `Émargement électronique : signatures recueillies en ligne par le lien personnel de chaque participant ; heure, appareil et empreinte conservés par ${organisme}.`
          : "Chaque apprenant signe au début de la demi-journée. En cas d'absence, laisser la case vide et l'indiquer au formateur.",
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
