import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { Prisma, type OrigineSignature } from "@prisma/client";

import { signatureConforme } from "@/lib/documents-libelles";
import { journaliser } from "@/lib/journal";
import { prisma } from "@/lib/prisma";
import { stockage } from "@/lib/stockage";

export type FichierPdf = { nom: string; octets: Uint8Array };

export class SignatureDejaTraitee extends Error {}

/// SIG-2026-0001, SIG-2026-0002… En cas de création simultanée, la contrainte
/// d'unicité tranche et on retente avec le numéro suivant.
export async function creerAvecReference<T>(creer: (reference: string) => Promise<T>): Promise<T> {
  const prefixe = `SIG-${new Date().getFullYear()}-`;
  for (let tentative = 0; tentative < 5; tentative++) {
    const derniere = await prisma.signatureRequest.findFirst({
      where: { reference: { startsWith: prefixe } },
      orderBy: { reference: "desc" },
      select: { reference: true },
    });
    const suivant = derniere ? Number(derniere.reference.slice(prefixe.length)) + 1 : 1;
    try {
      return await creer(`${prefixe}${String(suivant).padStart(4, "0")}`);
    } catch (erreur) {
      if (!(erreur instanceof Prisma.PrismaClientKnownRequestError && erreur.code === "P2002")) throw erreur;
    }
  }
  throw new Error("Impossible d'attribuer une référence de signature.");
}

/// Nom de fichier affichable : sans caractère de contrôle, barre oblique ni guillemet.
function nomPropre(nom: string): string {
  const propre = [...nom].filter((c) => c.charCodeAt(0) >= 32 && !'\\/"'.includes(c)).join("");
  return propre.slice(0, 200) || "document-signe.pdf";
}

/// Enregistre le document signé (et sa preuve) pour une demande en cours.
///
/// Le document signé devient une nouvelle version du document ; la preuve de
/// signature est conservée à part. L'opération ne peut aboutir qu'une fois :
/// deux traitements simultanés du même email ne créent pas deux versions.
export async function enregistrerDocumentSigne(params: {
  signatureRequestId: string;
  signe: FichierPdf;
  preuve?: FichierPdf;
  origine: OrigineSignature;
  userId?: string;
}) {
  const { signe, preuve } = params;
  if (!signatureConforme("application/pdf", signe.octets)) {
    throw new Error("Le document signé n'est pas un PDF valide.");
  }
  if (preuve && !signatureConforme("application/pdf", preuve.octets)) {
    throw new Error("La preuve de signature n'est pas un PDF valide.");
  }

  const demande = await prisma.signatureRequest.findUnique({
    where: { id: params.signatureRequestId },
    include: { document: { select: { id: true, nom: true, deletedAt: true } } },
  });
  if (!demande || demande.document.deletedAt) throw new Error("Demande de signature introuvable.");
  if (demande.statut === "SIGNEE" || demande.statut === "ANNULEE") throw new SignatureDejaTraitee();

  const documentId = demande.document.id;
  const empreinte = (octets: Uint8Array) => createHash("sha256").update(octets).digest("hex");
  const cheminSigne = `${documentId}/signe-${demande.reference}-${randomUUID()}.pdf`;
  const cheminPreuve = preuve ? `${documentId}/preuve-${demande.reference}-${randomUUID()}.pdf` : null;
  const chemins = [cheminSigne, ...(cheminPreuve ? [cheminPreuve] : [])];

  // Les fichiers d'abord, la base ensuite ; en cas d'échec, on retire les fichiers.
  try {
    await stockage().deposer(cheminSigne, signe.octets, "application/pdf");
    if (preuve && cheminPreuve) await stockage().deposer(cheminPreuve, preuve.octets, "application/pdf");
  } catch (erreur) {
    await stockage().supprimer(chemins).catch(() => undefined);
    throw erreur;
  }

  try {
    const version = await prisma.$transaction(async (tx) => {
      // Verrou : seule une demande encore ouverte peut passer à « signée ».
      const reservee = await tx.signatureRequest.updateMany({
        where: { id: demande.id, statut: { in: ["A_ENVOYER", "ENVOYEE"] }, versionSigneeId: null },
        data: { statut: "SIGNEE" },
      });
      if (reservee.count === 0) throw new SignatureDejaTraitee();

      const derniere = await tx.documentVersion.findFirst({
        where: { documentId },
        orderBy: { numero: "desc" },
        select: { numero: true },
      });
      const creee = await tx.documentVersion.create({
        data: {
          documentId,
          numero: (derniere?.numero ?? 0) + 1,
          cheminStockage: cheminSigne,
          nomFichier: nomPropre(signe.nom),
          typeMime: "application/pdf",
          taille: signe.octets.byteLength,
          empreinte: empreinte(signe.octets),
          commentaire: `Version signée (${demande.reference}, ${params.origine === "EMAIL" ? "récupérée automatiquement" : "déposée à la main"})`,
          createdById: params.userId ?? null,
        },
      });
      await tx.signatureRequest.update({
        where: { id: demande.id },
        data: {
          versionSigneeId: creee.id,
          origine: params.origine,
          signeeAt: new Date(),
          envoyeeAt: demande.envoyeeAt ?? new Date(),
          ...(preuve && cheminPreuve
            ? {
                preuveChemin: cheminPreuve,
                preuveNomFichier: nomPropre(preuve.nom),
                preuveTaille: preuve.octets.byteLength,
                preuveEmpreinte: empreinte(preuve.octets),
              }
            : {}),
        },
      });
      await tx.document.update({ where: { id: documentId }, data: { statut: "VALIDE", updatedAt: new Date() } });
      return creee;
    });

    await journaliser({
      action: "signature.completed",
      summary: `Document signé enregistré : ${demande.document.nom} (${demande.reference})`,
      entityType: "Document",
      entityId: documentId,
      userId: params.userId,
      metadata: { reference: demande.reference, origine: params.origine, preuve: Boolean(preuve), empreinte: version.empreinte },
    });
    return version;
  } catch (erreur) {
    await stockage().supprimer(chemins).catch(() => undefined);
    throw erreur;
  }
}
