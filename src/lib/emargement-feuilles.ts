import "server-only";

import { createHash, randomUUID } from "node:crypto";

import type { OrigineFeuilleEmargement } from "@prisma/client";
import { degrees, PDFDocument } from "pdf-lib";

import { cheminStockage } from "@/lib/documents-depot";
import { joursDeSession } from "@/lib/emargement";
import { journaliser } from "@/lib/journal";
import { prisma } from "@/lib/prisma";
import { stockage } from "@/lib/stockage";

/// Feuilles d'émargement signées (automatisation A-05) : une par jour de
/// session, produite d'elle-même quand toutes les signatures électroniques du
/// jour sont arrivées (lib/emargement-numerique.ts), reçue du formateur en
/// réponse à l'email du matin ou déposée à la main. Elles arrêtent les
/// relances et prouvent la présence (Qualiopi).

export type FichierFeuille = { nom: string; typeMime: string; octets: Uint8Array };

const FORMATS_FEUILLE = new Set(["application/pdf", "image/jpeg", "image/png"]);

/// Formats qu'une feuille signée peut prendre : un PDF (scan) ou une photo.
export const formatFeuilleAccepte = (typeMime: string) => FORMATS_FEUILLE.has(typeMime.toLowerCase().split(";")[0].trim());

const dateLongue = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

const COMMENTAIRE_ORIGINE: Record<OrigineFeuilleEmargement, string> = {
  EMAIL: "Reçue du formateur par email",
  DEPOT: "Déposée à la main",
  NUMERIQUE: "Produite à partir des signatures électroniques",
};

/// Orientation EXIF d'une photo JPEG (1 = droite ; 3, 6 et 8 = pivotée). Un
/// téléphone tenu debout enregistre souvent l'image couchée avec cette seule
/// indication : sans elle, la feuille apparaîtrait de travers dans le PDF.
function orientationJpeg(octets: Uint8Array): number {
  let i = 2;
  while (i + 4 < octets.length && octets[i] === 0xff) {
    const marqueur = octets[i + 1];
    const longueur = (octets[i + 2] << 8) | octets[i + 3];
    if (marqueur === 0xe1 && String.fromCharCode(...octets.slice(i + 4, i + 8)) === "Exif") {
      const tiff = i + 10;
      const petitBout = octets[tiff] === 0x49;
      const lire16 = (p: number) => (petitBout ? octets[p] | (octets[p + 1] << 8) : (octets[p] << 8) | octets[p + 1]);
      const lire32 = (p: number) =>
        petitBout
          ? (octets[p] | (octets[p + 1] << 8) | (octets[p + 2] << 16) | (octets[p + 3] << 24)) >>> 0
          : ((octets[p] << 24) | (octets[p + 1] << 16) | (octets[p + 2] << 8) | octets[p + 3]) >>> 0;
      const ifd = tiff + lire32(tiff + 4);
      const entrees = lire16(ifd);
      for (let n = 0; n < entrees; n++) {
        const entree = ifd + 2 + n * 12;
        if (lire16(entree) === 0x0112) return lire16(entree + 8);
      }
      return 1;
    }
    i += 2 + longueur;
  }
  return 1;
}

/// Assemble les fichiers reçus en un seul PDF : une journée, une feuille,
/// quel que soit le nombre de pages ou de photos envoyées. Chaque photo
/// occupe une page A4, dans le sens de la photo, redressée si besoin.
async function assemblerPdf(fichiers: FichierFeuille[]): Promise<Uint8Array> {
  if (fichiers.length === 1 && fichiers[0].typeMime === "application/pdf") return fichiers[0].octets;
  const pdf = await PDFDocument.create();
  pdf.setCreator("Formalogy OS");
  for (const f of fichiers) {
    if (f.typeMime === "application/pdf") {
      const source = await PDFDocument.load(f.octets, { ignoreEncryption: true });
      for (const page of await pdf.copyPages(source, source.getPageIndices())) pdf.addPage(page);
      continue;
    }
    const image = f.typeMime === "image/png" ? await pdf.embedPng(f.octets) : await pdf.embedJpg(f.octets);
    const orientation = f.typeMime === "image/jpeg" ? orientationJpeg(f.octets) : 1;
    const couchee = orientation === 6 || orientation === 8;
    // Dimensions telles qu'elles s'affichent, une fois la photo redressée.
    const largeurVue = couchee ? image.height : image.width;
    const hauteurVue = couchee ? image.width : image.height;
    const [L, H] = largeurVue > hauteurVue ? [841.89, 595.28] : [595.28, 841.89];
    const page = pdf.addPage([L, H]);
    const echelle = Math.min((L - 36) / largeurVue, (H - 36) / hauteurVue);
    const w = image.width * echelle;
    const h = image.height * echelle;
    const [cx, cy] = [L / 2, H / 2];
    // pdf-lib tourne l'image autour de son coin bas-gauche : on place ce coin
    // pour que l'image redressée tombe au centre de la page.
    if (orientation === 6) page.drawImage(image, { x: cx - h / 2, y: cy + w / 2, width: w, height: h, rotate: degrees(-90) });
    else if (orientation === 8) page.drawImage(image, { x: cx + h / 2, y: cy - w / 2, width: w, height: h, rotate: degrees(90) });
    else if (orientation === 3) page.drawImage(image, { x: cx + w / 2, y: cy + h / 2, width: w, height: h, rotate: degrees(180) });
    else page.drawImage(image, { x: cx - w / 2, y: cy - h / 2, width: w, height: h });
  }
  return pdf.save();
}

/// Range la feuille signée d'un jour de session. Un nouveau dépôt pour le même
/// jour ajoute une version au même document plutôt qu'un doublon.
export async function enregistrerFeuilleSignee(p: {
  sessionId: string;
  jour: Date;
  fichiers: FichierFeuille[];
  origine: OrigineFeuilleEmargement;
  userId?: string;
}): Promise<{ documentId: string } | { erreur: string }> {
  const fichiers = p.fichiers.filter((f) => formatFeuilleAccepte(f.typeMime)).map((f) => ({ ...f, typeMime: f.typeMime.toLowerCase().split(";")[0].trim() }));
  if (fichiers.length === 0) return { erreur: "Aucun fichier exploitable : une feuille signée se dépose en PDF ou en photo (JPEG, PNG)." };

  const session = await prisma.trainingSession.findFirst({ where: { id: p.sessionId, deletedAt: null }, select: { id: true, numero: true } });
  if (!session) return { erreur: "Session introuvable." };

  let octets: Uint8Array;
  try {
    octets = await assemblerPdf(fichiers);
  } catch {
    return { erreur: "Le fichier reçu est illisible (PDF protégé ou image endommagée)." };
  }

  const type = await prisma.documentType.findUniqueOrThrow({ where: { code: "EMARGEMENT" } });
  const existante = await prisma.feuilleEmargementSignee.findUnique({
    where: { sessionId_jour: { sessionId: p.sessionId, jour: p.jour } },
    include: { document: { include: { versions: { orderBy: { numero: "desc" }, take: 1 } } } },
  });
  const documentId = existante?.documentId ?? randomUUID();
  const numero = (existante?.document.versions[0]?.numero ?? 0) + 1;
  const chemin = cheminStockage(documentId, numero, "pdf");
  const iso = p.jour.toISOString().slice(0, 10);
  const version = {
    numero,
    cheminStockage: chemin,
    nomFichier: `Emargement-signe-${session.numero}-${iso}.pdf`,
    typeMime: "application/pdf",
    taille: octets.byteLength,
    empreinte: createHash("sha256").update(octets).digest("hex"),
    commentaire: COMMENTAIRE_ORIGINE[p.origine],
    createdById: p.userId,
  };

  await stockage().deposer(chemin, octets, "application/pdf");
  try {
    if (existante) {
      await prisma.documentVersion.create({ data: { ...version, documentId } });
      await prisma.document.update({ where: { id: documentId }, data: { updatedAt: new Date() } });
    } else {
      await prisma.$transaction([
        prisma.document.create({
          data: {
            id: documentId,
            nom: `Feuille d'émargement signée — ${dateLongue.format(p.jour)} (${session.numero})`,
            typeId: type.id,
            categorie: "SESSION",
            statut: "VALIDE",
            sessionId: session.id,
            createdById: p.userId,
            versions: { create: version },
          },
        }),
        prisma.feuilleEmargementSignee.create({ data: { sessionId: session.id, jour: p.jour, documentId, origine: p.origine } }),
      ]);
    }
  } catch (erreur) {
    await stockage().supprimer([chemin]).catch(() => undefined);
    throw erreur;
  }

  await journaliser({
    action: "attendance.sheet_received",
    summary: `Feuille d'émargement signée du ${dateLongue.format(p.jour)} ${COMMENTAIRE_ORIGINE[p.origine].toLowerCase()} (session ${session.numero})`,
    entityType: "TrainingSession",
    entityId: session.id,
    userId: p.userId,
  });
  return { documentId };
}

/// Jours de session passés (jusqu'à `jusqua` inclus) dont la feuille signée
/// n'est pas encore arrivée.
export async function joursSansFeuille(session: { id: string; dateDebut: Date; dateFin: Date }, jusqua: Date): Promise<Date[]> {
  const recues = await prisma.feuilleEmargementSignee.findMany({ where: { sessionId: session.id }, select: { jour: true } });
  const faits = new Set(recues.map((f) => f.jour.getTime()));
  return joursDeSession(session.dateDebut, session.dateFin).filter((j) => j <= jusqua && !faits.has(j.getTime()));
}

export const libelleJour = (jour: Date) => dateLongue.format(jour);
