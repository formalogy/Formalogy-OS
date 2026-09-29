import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";

import { LIBELLE_RESULTAT } from "@/lib/attestations-pdf";
import { cheminStockage } from "@/lib/documents-depot";
import { journaliser } from "@/lib/journal";
import { lireOrganisme } from "@/lib/organisme";
import { lireLogoOrganisme } from "@/lib/organisme-signature";
import { lignesDe } from "@/lib/pdf-outils";
import { prisma } from "@/lib/prisma";
import { texteReponse, type Question } from "@/lib/questionnaires-questions";
import { formaterPeriode } from "@/lib/sessions-libelles";
import { stockage } from "@/lib/stockage";

/// Bilan de session du formateur (demande du client du 29/09/2026) : rempli
/// en ligne comme les questionnaires (type CHAUD_FORMATEUR), il devient un
/// document PDF rangé dans la session dès sa validation — réponses du
/// formateur et évaluation des acquis de chaque apprenant.

// A4 portrait, en points
const LARGEUR = 595.28;
const HAUTEUR = 841.89;
const MARGE = 56;
const NOIR = rgb(0.12, 0.14, 0.16);
const GRIS = rgb(0.42, 0.45, 0.48);
const TRAIT = rgb(0.78, 0.8, 0.83);

const dateHeure = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

/// Rédaction sur plusieurs pages : une nouvelle page s'ouvre quand la place manque.
class Redaction {
  page!: PDFPage;
  y = 0;
  constructor(
    readonly pdf: PDFDocument,
    readonly normal: PDFFont,
    readonly gras: PDFFont,
  ) {
    this.nouvellePage();
  }

  nouvellePage() {
    this.page = this.pdf.addPage([LARGEUR, HAUTEUR]);
    this.y = HAUTEUR - MARGE;
  }

  place(hauteur: number) {
    if (this.y - hauteur < MARGE + 20) this.nouvellePage();
  }

  texte(t: string, { taille = 10.5, police = this.normal, couleur = NOIR, retrait = 0 } = {}) {
    for (const ligne of lignesDe(police, t, taille, LARGEUR - 2 * MARGE - retrait)) {
      this.place(taille * 1.45);
      this.page.drawText(ligne, { x: MARGE + retrait, y: this.y, size: taille, font: police, color: couleur });
      this.y -= taille * 1.45;
    }
  }

  titre(t: string) {
    this.place(40);
    this.y -= 8;
    this.texte(t, { taille: 12.5, police: this.gras });
    this.page.drawLine({ start: { x: MARGE, y: this.y + 8 }, end: { x: LARGEUR - MARGE, y: this.y + 8 }, thickness: 0.6, color: TRAIT });
    this.y -= 6;
  }

  espace(points: number) {
    this.y -= points;
  }
}

type DonneesBilan = {
  organisme: string;
  logo: { octets: Uint8Array; typeMime: string } | null;
  formation: string;
  session: { numero: string; dateDebut: Date; dateFin: Date; lieu: string | null };
  formateur: string;
  transmisLe: Date;
  questions: Question[];
  reponses: Record<string, unknown>;
  evaluations: { apprenant: string; resultat: keyof typeof LIBELLE_RESULTAT; commentaire: string | null }[];
};

export async function genererBilanSession(d: DonneesBilan): Promise<Uint8Array> {
  const pdf = await PDFDocument.create({ updateMetadata: false });
  pdf.setTitle(`Bilan de session ${d.session.numero}`);
  pdf.setCreator("Formalogy OS");
  pdf.setProducer("Formalogy OS");
  pdf.setCreationDate(d.transmisLe);
  pdf.setModificationDate(d.transmisLe);
  const r = new Redaction(pdf, await pdf.embedFont(StandardFonts.Helvetica), await pdf.embedFont(StandardFonts.HelveticaBold));

  // En-tête : le logo s'il est déposé, le nom de l'organisme sinon.
  let logoPose = false;
  if (d.logo) {
    try {
      const dessin = d.logo.typeMime === "image/png" ? await pdf.embedPng(d.logo.octets) : await pdf.embedJpg(d.logo.octets);
      const facteur = Math.min(150 / dessin.width, 40 / dessin.height);
      r.page.drawImage(dessin, { x: MARGE, y: r.y - dessin.height * facteur, width: dessin.width * facteur, height: dessin.height * facteur });
      r.espace(dessin.height * facteur + 14);
      logoPose = true;
    } catch {
      console.error("Logo de l'organisme illisible : bilan produit sans lui.");
    }
  }
  if (!logoPose) r.texte(d.organisme, { taille: 11, police: r.gras, couleur: GRIS });

  r.espace(6);
  r.texte("Bilan de session", { taille: 20, police: r.gras });
  r.espace(2);
  r.texte(d.formation, { taille: 12, police: r.gras });
  r.texte(
    [`Session ${d.session.numero}`, formaterPeriode(d.session.dateDebut, d.session.dateFin), d.session.lieu, `Formateur : ${d.formateur}`].filter(Boolean).join(" · "),
    { taille: 9.5, couleur: GRIS },
  );
  r.texte(`Transmis en ligne par le formateur le ${dateHeure.format(d.transmisLe).replace(" ", " à ")}.`, { taille: 9.5, couleur: GRIS });

  r.titre("Bilan du formateur");
  for (const q of d.questions) {
    if (q.section) {
      r.espace(4);
      r.texte(q.section, { taille: 10, police: r.gras, couleur: GRIS });
    }
    r.place(34);
    r.texte(q.libelle, { taille: 10, police: r.gras });
    r.texte(texteReponse(q, d.reponses[q.id]) ?? "— sans réponse", { taille: 10.5, retrait: 10, couleur: texteReponse(q, d.reponses[q.id]) ? NOIR : GRIS });
    r.espace(6);
  }

  r.titre("Évaluation des acquis");
  if (d.evaluations.length === 0) r.texte("Aucune évaluation transmise.", { couleur: GRIS });
  for (const e of d.evaluations) {
    r.place(30);
    r.texte(`${e.apprenant} : ${LIBELLE_RESULTAT[e.resultat]}`, { taille: 10.5, police: r.gras });
    if (e.commentaire) r.texte(e.commentaire, { taille: 10, retrait: 10, couleur: GRIS });
    r.espace(4);
  }

  // Pied de page : numéro de page et origine du document.
  const pages = pdf.getPages();
  pages.forEach((page, i) => {
    page.drawText(`Bilan de session ${d.session.numero} — ${d.organisme} — page ${i + 1} / ${pages.length}`, {
      x: MARGE,
      y: MARGE - 24,
      size: 8,
      font: r.normal,
      color: GRIS,
    });
  });
  return pdf.save();
}

/// Range le bilan d'un formateur, une fois rempli, parmi les documents de sa
/// session. Appelé à la validation du questionnaire ; un bilan déjà rangé ne
/// l'est pas deux fois.
export async function rangerBilanSession(questionnaireId: string): Promise<string | null> {
  const q = await prisma.questionnaire.findUnique({
    where: { id: questionnaireId },
    include: {
      trainer: { select: { prenom: true, nom: true } },
      session: { select: { id: true, numero: true, dateDebut: true, dateFin: true, lieu: true, formation: { select: { titre: true } } } },
    },
  });
  if (!q || q.type !== "CHAUD_FORMATEUR" || !q.reponduAt || !q.session) return null;

  const type = await prisma.documentType.findUniqueOrThrow({ where: { code: "QUESTIONNAIRE_CHAUD_FORMATEUR" } });
  const nom = `Bilan de session — ${q.session.numero} (${q.session.formation.titre})`;
  const deja = await prisma.document.findFirst({ where: { sessionId: q.session.id, typeId: type.id, nom, deletedAt: null }, select: { id: true } });
  if (deja) return deja.id;

  const [organisme, logo, evaluations] = await Promise.all([
    lireOrganisme(),
    lireLogoOrganisme().catch(() => null),
    prisma.evaluationAcquis.findMany({
      where: { sessionId: q.session.id },
      orderBy: [{ learner: { nom: "asc" } }, { learner: { prenom: "asc" } }],
      select: { resultat: true, commentaire: true, learner: { select: { prenom: true, nom: true } } },
    }),
  ]);
  const octets = await genererBilanSession({
    organisme: organisme.raisonSociale,
    logo,
    formation: q.session.formation.titre,
    session: q.session,
    formateur: q.trainer ? `${q.trainer.prenom} ${q.trainer.nom}` : "non renseigné",
    transmisLe: q.reponduAt,
    questions: (q.questions as Question[] | null) ?? [],
    reponses: (q.reponses as Record<string, unknown> | null) ?? {},
    evaluations: evaluations.map((e) => ({ apprenant: `${e.learner.prenom} ${e.learner.nom}`, resultat: e.resultat, commentaire: e.commentaire })),
  });

  const documentId = randomUUID();
  const chemin = cheminStockage(documentId, 1, "pdf");
  await stockage().deposer(chemin, octets, "application/pdf");
  try {
    await prisma.document.create({
      data: {
        id: documentId,
        nom,
        typeId: type.id,
        categorie: "SESSION",
        statut: "VALIDE",
        sessionId: q.session.id,
        versions: {
          create: {
            numero: 1,
            cheminStockage: chemin,
            nomFichier: `Bilan-session-${q.session.numero}.pdf`,
            typeMime: "application/pdf",
            taille: octets.byteLength,
            empreinte: createHash("sha256").update(octets).digest("hex"),
            commentaire: "Rempli en ligne par le formateur",
          },
        },
      },
    });
  } catch (erreur) {
    await stockage().supprimer([chemin]).catch(() => undefined);
    throw erreur;
  }
  await journaliser({
    action: "session.review_received",
    summary: `Bilan de session reçu du formateur (session ${q.session.numero})`,
    entityType: "TrainingSession",
    entityId: q.session.id,
  });
  return documentId;
}
