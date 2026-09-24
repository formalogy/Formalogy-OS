import "server-only";

import type { Organisme } from "@prisma/client";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import { CRENEAUX, horairesDemiJournees, joursDeSession, LIBELLE_CRENEAU } from "@/lib/emargement";
import { lignesDe, texteSur } from "@/lib/pdf-outils";

// ---------------------------------------------------------------------------
// Convocation : le document que reçoit l'apprenant avant sa formation. Il
// reprend la trame du modèle fourni par le client — séances détaillées,
// référent handicap, contacts, mention RGPD, page de signature.
//
// Un référent non renseigné dans Paramètres → Organisme fait simplement
// disparaître son paragraphe : mieux vaut une convocation sans la section que
// la section avec un nom manquant.
// ---------------------------------------------------------------------------

const A4 = { largeur: 595.28, hauteur: 841.89 };
const MARGE = { gauche: 64, droite: 64, haut: 64, bas: 76 };
const LARGEUR = A4.largeur - MARGE.gauche - MARGE.droite;

const ENCRE = rgb(0.13, 0.2, 0.29);
const DOUCE = rgb(0.38, 0.45, 0.53);
const ACCENT = rgb(0, 0.42, 0.52);
const FILET = rgb(0.85, 0.88, 0.91);
const FOND_TABLEAU = rgb(0.957, 0.969, 0.98);

const DATE_FIXE = new Date(Date.UTC(1980, 0, 1));
const jourCourt = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const jourChiffre = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });

export type DonneesConvocation = {
  organisme: Organisme;
  apprenant: { prenom: string; nom: string };
  formation: { titre: string; dureeHeures: unknown };
  session: {
    numero: string;
    dateDebut: Date;
    dateFin: Date;
    horaires: string | null;
    lieu: string | null;
    modaliteLibelle: string;
  };
  formateur: { nom: string; email: string | null; telephone: string | null } | null;
  /// Date d'établissement, fixe pour qu'une convocation régénérée à
  /// l'identique donne le même fichier.
  etabliLe: Date;
  signature?: { octets: Uint8Array; typeMime: string } | null;
  logo?: { octets: Uint8Array; typeMime: string } | null;
};

export async function genererConvocation(d: DonneesConvocation): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Convocation — ${d.session.numero}`);
  pdf.setCreator("Formalogy OS");
  pdf.setProducer("Formalogy OS");
  pdf.setCreationDate(DATE_FIXE);
  pdf.setModificationDate(DATE_FIXE);

  const normale = await pdf.embedFont(StandardFonts.Helvetica);
  const grasse = await pdf.embedFont(StandardFonts.HelveticaBold);
  const r = new Redaction(pdf, normale, grasse);

  await r.enTete(d.organisme.raisonSociale, d.logo);
  r.titre("Convocation");
  r.paragraphe(`Bonjour ${d.apprenant.prenom} ${d.apprenant.nom},`);
  r.paragraphe(`Vous êtes inscrit(e) à la session de formation suivante :`);
  r.paragraphe(d.formation.titre, { police: grasse, taille: 12 });

  const jours = joursDeSession(d.session.dateDebut, d.session.dateFin);
  const heures = d.formation.dureeHeures ? `, soit ${Number(d.formation.dureeHeures)} heures` : "";
  r.paragraphe(
    `Elle se déroulera sur ${jours.length} jour${jours.length > 1 ? "s" : ""}${heures}. Le détail des séances est précisé ci-dessous :`,
  );

  r.tableauSeances(jours, horairesDemiJournees(d.session.horaires), d.session.modaliteLibelle, d.session.lieu);

  const { organisme: o } = d;
  if (o.referentHandicapNom) {
    r.sousTitre("À l'attention des personnes ayant besoin d'une adaptation");
    r.paragraphe(
      `Notre organisme peut mettre en place des adaptations ou des compensations nécessaires au bon déroulement de votre formation. Si vous rencontrez une difficulté, ou si vous êtes en situation de handicap même temporaire, contactez directement ${o.referentHandicapNom}${contact(o.referentHandicapEmail, o.referentHandicapTelephone)}, ou signalez-le dans votre questionnaire de positionnement.`,
    );
  }

  r.sousTitre("En cas de besoin");
  if (d.formateur) {
    r.paragraphe(`Votre formateur : ${d.formateur.nom}${contact(d.formateur.email, d.formateur.telephone)}.`);
  }
  if (o.referentAdministratifNom) {
    r.paragraphe(
      `Pour toute question administrative : ${o.referentAdministratifNom}${contact(o.referentAdministratifEmail, o.referentAdministratifTelephone)}.`,
    );
  }
  if (!d.formateur && !o.referentAdministratifNom) {
    r.paragraphe(`Contactez ${o.raisonSociale}${contact(o.email, o.telephone)}.`);
  }

  if (o.referentRgpdNom || o.referentRgpdEmail) {
    r.sousTitre("Données personnelles");
    r.paragraphe(
      `Les informations recueillies dans les documents de formation ne sont utilisées que dans le cadre de notre relation avec vous. Vous pouvez à tout moment exercer vos droits prévus par le RGPD auprès de ${o.referentRgpdNom ?? o.raisonSociale}${contact(o.referentRgpdEmail, null)}.`,
    );
  }

  // La formule de politesse, le nom de l'organisme et le cadre de signature
  // forment un tout : on ne les laisse pas se couper entre deux pages.
  r.reserver(230);
  r.paragraphe("En vous remerciant de votre confiance.");
  r.paragraphe("Bien cordialement,");
  r.paragraphe(o.raisonSociale, { police: grasse });

  r.signature(d.organisme, d.etabliLe, d.signature);
  await r.terminer(d.signature);
  r.piedsDePage(o);

  return pdf.save();
}

const contact = (email: string | null | undefined, telephone: string | null | undefined) => {
  const parties = [email, telephone].filter(Boolean);
  return parties.length > 0 ? ` (${parties.join(" — ")})` : "";
};

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

class Redaction {
  private page: PDFPage;
  private y: number;
  /// L'image de signature ne peut être posée qu'après coup : on retient donc
  /// l'endroit réservé pour elle.
  private emplacementSignature: { page: PDFPage; x: number; y: number } | null = null;

  constructor(
    private pdf: PDFDocument,
    private normale: PDFFont,
    private grasse: PDFFont,
  ) {
    this.page = pdf.addPage([A4.largeur, A4.hauteur]);
    this.y = A4.hauteur - MARGE.haut;
  }

  private nouvellePage() {
    this.page = this.pdf.addPage([A4.largeur, A4.hauteur]);
    this.y = A4.hauteur - MARGE.haut;
  }

  private placePour(hauteur: number) {
    if (this.y - hauteur < MARGE.bas) this.nouvellePage();
  }

  /// Passe à la page suivante si le bloc à venir n'y tient pas entièrement.
  reserver(hauteur: number) {
    this.placePour(hauteur);
  }

  private ecrire(texte: string, x: number, y: number, taille: number, police = this.normale, couleur = ENCRE) {
    this.page.drawText(texteSur(police, texte), { x, y, size: taille, font: police, color: couleur });
  }

  /// Le logo s'il existe, le nom de l'organisme sinon. Un logo illisible ne
  /// fait jamais échouer le document.
  async enTete(nom: string, logo?: { octets: Uint8Array; typeMime: string } | null) {
    let hauteurLogo = 0;
    if (logo) {
      try {
        const dessin = logo.typeMime === "image/png" ? await this.pdf.embedPng(logo.octets) : await this.pdf.embedJpg(logo.octets);
        // Hauteur bornée : un logo très haut ne doit pas manger la page.
        const facteur = Math.min(170 / dessin.width, 44 / dessin.height);
        hauteurLogo = dessin.height * facteur;
        this.page.drawImage(dessin, {
          x: MARGE.gauche,
          y: this.y - hauteurLogo,
          width: dessin.width * facteur,
          height: hauteurLogo,
        });
      } catch {
        console.error("Logo de l'organisme illisible : document produit sans lui.");
      }
    }
    if (hauteurLogo === 0) {
      this.ecrire(nom.toUpperCase(), MARGE.gauche, this.y - 11, 11, this.grasse, ACCENT);
      hauteurLogo = 15;
    }
    this.y -= hauteurLogo + 11;
    this.page.drawLine({
      start: { x: MARGE.gauche, y: this.y },
      end: { x: A4.largeur - MARGE.droite, y: this.y },
      thickness: 1,
      color: ACCENT,
    });
    this.y -= 30;
  }

  titre(texte: string) {
    const largeur = this.grasse.widthOfTextAtSize(texte, 20);
    this.ecrire(texte, MARGE.gauche + (LARGEUR - largeur) / 2, this.y - 20, 20, this.grasse);
    this.y -= 46;
  }

  sousTitre(texte: string) {
    this.placePour(60);
    this.y -= 12;
    this.ecrire(texte.toUpperCase(), MARGE.gauche, this.y - 10, 9.5, this.grasse, ACCENT);
    this.y -= 22;
  }

  paragraphe(texte: string, options: { police?: PDFFont; taille?: number } = {}) {
    const police = options.police ?? this.normale;
    const taille = options.taille ?? 10.5;
    const pas = taille * 1.55;
    for (const ligne of lignesDe(police, texte, taille, LARGEUR)) {
      this.placePour(pas);
      this.ecrire(ligne, MARGE.gauche, this.y - pas + 4, taille, police);
      this.y -= pas;
    }
    this.y -= 9;
  }

  /// Une ligne par demi-journée : c'est le détail qu'attend l'apprenant, et
  /// celui que reprend la feuille d'émargement.
  tableauSeances(
    jours: Date[],
    horaires: Record<(typeof CRENEAUX)[number], string | null>,
    modalite: string,
    lieu: string | null,
  ) {
    const colonnes = [
      { titre: "Date", largeur: 150 },
      { titre: "Horaire", largeur: 92 },
      { titre: "Modalité", largeur: 70 },
      { titre: "Lieu", largeur: LARGEUR - 312 },
    ];
    const pasLigne = 11.5;

    this.placePour(90);
    // En-tête
    this.page.drawRectangle({ x: MARGE.gauche, y: this.y - 20, width: LARGEUR, height: 20, color: FOND_TABLEAU });
    let x = MARGE.gauche;
    for (const c of colonnes) {
      this.ecrire(c.titre, x + 8, this.y - 14, 8.5, this.grasse, DOUCE);
      x += c.largeur;
    }
    this.y -= 20;

    for (const jour of jours) {
      for (const creneau of CRENEAUX) {
        const valeurs = [
          `${jourCourt.format(jour)} — ${LIBELLE_CRENEAU[creneau].toLowerCase()}`,
          horaires[creneau] ?? "à préciser",
          modalite,
          lieu ?? "à préciser",
        ];
        // Chaque cellule peut tenir sur deux lignes : une adresse complète ne
        // doit pas être coupée au milieu.
        const cellules = colonnes.map((c, i) => lignesDe(this.normale, valeurs[i], 9, c.largeur - 16).slice(0, 2));
        const hauteur = Math.max(...cellules.map((l) => l.length)) * pasLigne + 10;
        this.placePour(hauteur);

        x = MARGE.gauche;
        colonnes.forEach((c, i) => {
          this.page.drawRectangle({
            x,
            y: this.y - hauteur,
            width: c.largeur,
            height: hauteur,
            borderColor: FILET,
            borderWidth: 0.5,
          });
          for (const [rang, ligne] of cellules[i].entries()) {
            this.ecrire(ligne, x + 8, this.y - 15 - rang * pasLigne, 9, this.normale);
          }
          x += c.largeur;
        });
        this.y -= hauteur;
      }
    }
    this.y -= 18;
  }

  signature(organisme: Organisme, etabliLe: Date, image?: { octets: Uint8Array; typeMime: string } | null) {
    this.placePour(140);
    this.y -= 10;
    this.ecrire(`Fait à ${organisme.ville ?? "…"}, le ${jourChiffre.format(etabliLe)}`, MARGE.gauche, this.y - 11, 10.5);
    this.y -= 26;
    this.ecrire("Pour l'organisme de formation", MARGE.gauche, this.y - 10, 9.5, this.normale, DOUCE);
    this.y -= 16;
    this.ecrire(
      `${organisme.representantNom ?? ""}${organisme.representantFonction ? `, ${organisme.representantFonction}` : ""}`,
      MARGE.gauche,
      this.y - 11,
      10.5,
      this.grasse,
    );
    this.y -= 20;
    const cadre = { x: MARGE.gauche, y: this.y - 76, largeur: 230, hauteur: 72 };
    this.page.drawRectangle({
      x: cadre.x,
      y: cadre.y,
      width: cadre.largeur,
      height: cadre.hauteur,
      borderColor: FILET,
      borderWidth: 0.6,
    });
    if (image) this.emplacementSignature = { page: this.page, x: cadre.x, y: cadre.y };
    this.y -= 86;
  }

  /// Pose l'image de signature dans le cadre réservé. Une image illisible
  /// n'empêche jamais la convocation d'être produite.
  async terminer(image?: { octets: Uint8Array; typeMime: string } | null) {
    if (!image || !this.emplacementSignature) return;
    try {
      const dessin = image.typeMime === "image/png" ? await this.pdf.embedPng(image.octets) : await this.pdf.embedJpg(image.octets);
      const facteur = Math.min(218 / dessin.width, 60 / dessin.height);
      const { page, x, y } = this.emplacementSignature;
      page.drawImage(dessin, {
        x: x + (230 - dessin.width * facteur) / 2,
        y: y + (72 - dessin.height * facteur) / 2,
        width: dessin.width * facteur,
        height: dessin.height * facteur,
      });
    } catch {
      console.error("Signature de l'organisme illisible : convocation produite sans elle.");
    }
  }

  piedsDePage(organisme: Organisme) {
    const mentions = [
      organisme.raisonSociale,
      organisme.siret ? `SIRET ${organisme.siret}` : null,
      organisme.numeroDeclaration
        ? `déclaration d'activité n° ${organisme.numeroDeclaration} — cet enregistrement ne vaut pas agrément de l'État`
        : null,
    ]
      .filter(Boolean)
      .join(" — ");

    const pages = this.pdf.getPages();
    for (const [index, page] of pages.entries()) {
      const y = MARGE.bas - 40;
      page.drawLine({
        start: { x: MARGE.gauche, y: y + 22 },
        end: { x: A4.largeur - MARGE.droite, y: y + 22 },
        thickness: 0.5,
        color: FILET,
      });
      for (const [rang, ligne] of lignesDe(this.normale, mentions, 7.5, LARGEUR).slice(0, 2).entries()) {
        const rendu = texteSur(this.normale, ligne);
        page.drawText(rendu, {
          x: (A4.largeur - this.normale.widthOfTextAtSize(rendu, 7.5)) / 2,
          y: y + 11 - rang * 10,
          size: 7.5,
          font: this.normale,
          color: DOUCE,
        });
      }
      const numero = `Page ${index + 1} / ${pages.length}`;
      page.drawText(numero, {
        x: A4.largeur - MARGE.droite - this.normale.widthOfTextAtSize(numero, 7.5),
        y: y - 10,
        size: 7.5,
        font: this.normale,
        color: DOUCE,
      });
    }
  }
}
