import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { enregistrerDocumentSigne, SignatureDejaTraitee, type FichierPdf } from "@/lib/signatures/enregistrement";
import { MOTIF_REFERENCE } from "@/lib/signatures/libelles";

export type PieceJointe = { nom: string; typeMime: string; octets: Uint8Array };

export type EmailRecu = {
  messageId: string;
  expediteur: string;
  sujet: string;
  recuAt: Date;
  /// Vrai seulement si le serveur de messagerie a vérifié que l'email vient
  /// réellement de BoldSign (signature DKIM valide du domaine boldsign.com).
  /// Sans cette vérification, n'importe qui pourrait déposer un faux
  /// « document signé » dans la boîte.
  authentifieBoldSign: boolean;
  piecesJointes: PieceJointe[];
};

type Conclusion = "RAPPROCHE" | "IGNORE" | "A_VERIFIER";
export type ResultatRapprochement = { resultat: Conclusion | "DEJA_VU" | "A_REESSAYER"; motif?: string; reference?: string };

const estPdf = (p: PieceJointe) => p.typeMime === "application/pdf" || p.nom.toLowerCase().endsWith(".pdf");

/// Le journal d'audit BoldSign porte « audit » (ou « trail ») dans son nom.
const estPreuve = (p: PieceJointe) => /audit|trail/i.test(p.nom);

/// Examine un email de la boîte dédiée. S'il s'agit d'un document signé
/// BoldSign portant une référence connue, il est enregistré dans la bonne
/// fiche. Chaque email n'est examiné qu'une fois (identifiant Message-ID).
export async function rapprocherEmail(email: EmailRecu): Promise<ResultatRapprochement> {
  if (await prisma.emailEntrant.findUnique({ where: { messageId: email.messageId } })) {
    return { resultat: "DEJA_VU" };
  }

  const conclure = async (
    resultat: Conclusion,
    detail: { motif?: string; reference?: string; signatureRequestId?: string } = {},
  ): Promise<ResultatRapprochement> => {
    try {
      await prisma.emailEntrant.create({
        data: {
          messageId: email.messageId,
          expediteur: email.expediteur.slice(0, 300),
          sujet: email.sujet.slice(0, 500),
          recuAt: email.recuAt,
          resultat,
          motif: detail.motif,
          signatureRequestId: detail.signatureRequestId,
        },
      });
    } catch (erreur) {
      // Examiné au même moment par un autre passage.
      if (erreur instanceof Prisma.PrismaClientKnownRequestError && erreur.code === "P2002") return { resultat: "DEJA_VU" };
      throw erreur;
    }
    return { resultat, motif: detail.motif, reference: detail.reference };
  };

  if (!email.authentifieBoldSign) {
    return conclure("IGNORE", { motif: "Email qui ne provient pas de BoldSign, ou dont l'origine n'a pas pu être vérifiée." });
  }

  const pdfs = email.piecesJointes.filter(estPdf);
  // Les notifications intermédiaires (envoi, rappel, consultation) n'ont pas
  // de document joint : seules les fins de signature nous intéressent.
  if (pdfs.length === 0) {
    return conclure("IGNORE", { motif: "Notification BoldSign sans document joint." });
  }

  const references = new Set([
    ...(email.sujet.match(MOTIF_REFERENCE) ?? []),
    ...pdfs.flatMap((p) => p.nom.match(MOTIF_REFERENCE) ?? []),
  ]);
  if (references.size === 0) {
    return conclure("A_VERIFIER", { motif: "Document signé reçu sans référence SIG-… dans le titre : à rattacher à la main." });
  }
  if (references.size > 1) {
    return conclure("A_VERIFIER", { motif: `Plusieurs références dans le même email : ${[...references].join(", ")}.` });
  }

  const reference = [...references][0];
  const demande = await prisma.signatureRequest.findUnique({ where: { reference } });
  if (!demande) {
    return conclure("A_VERIFIER", { reference, motif: `Référence ${reference} inconnue dans Formalogy OS.` });
  }
  const lien = { reference, signatureRequestId: demande.id };
  if (demande.statut === "SIGNEE") {
    return conclure("IGNORE", { ...lien, motif: "Document déjà enregistré comme signé." });
  }
  if (demande.statut === "ANNULEE") {
    return conclure("A_VERIFIER", { ...lien, motif: "Document signé reçu pour une demande annulée." });
  }

  const signes = pdfs.filter((p) => !estPreuve(p));
  const preuves = pdfs.filter(estPreuve);
  if (signes.length !== 1 || preuves.length > 1) {
    return conclure("A_VERIFIER", {
      ...lien,
      motif: `Pièces jointes inattendues (${pdfs.map((p) => p.nom).join(", ")}) : à déposer à la main.`,
    });
  }

  const fichier = (p: PieceJointe): FichierPdf => ({ nom: p.nom, octets: p.octets });
  try {
    await enregistrerDocumentSigne({
      signatureRequestId: demande.id,
      signe: fichier(signes[0]),
      preuve: preuves[0] ? fichier(preuves[0]) : undefined,
      origine: "EMAIL",
    });
  } catch (erreur) {
    if (erreur instanceof SignatureDejaTraitee) {
      return conclure("IGNORE", { ...lien, motif: "Document déjà enregistré comme signé." });
    }
    console.error("Enregistrement du document signé impossible :", erreur);
    // Aucune trace enregistrée : l'email sera réexaminé au prochain passage.
    return { resultat: "A_REESSAYER", reference, motif: "Enregistrement impossible pour le moment." };
  }

  return conclure("RAPPROCHE", {
    ...lien,
    motif: preuves[0] ? undefined : "Aucune preuve de signature jointe à l'email.",
  });
}
