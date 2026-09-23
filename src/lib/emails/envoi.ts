import "server-only";

import { randomUUID } from "node:crypto";

import nodemailer, { type Transporter } from "nodemailer";

import { pixelSuivi, texteVersHtml } from "@/lib/emails/modeles";
import { lireOrganisme } from "@/lib/organisme";
import { prisma } from "@/lib/prisma";

/// Envoi par un compte Gmail dédié (SMTP + mot de passe d'application).
///
/// Deux modes :
/// - simulation (par défaut) : l'email est enregistré dans l'historique avec le
///   statut SIMULE, rien ne quitte l'application ;
/// - envoi réel : uniquement si EMAILS_ENVOI_REEL vaut exactement « true » ET
///   que l'adresse Gmail et son mot de passe d'application sont renseignés.
///
/// Ce verrou évite qu'un apprenant réel reçoive un message pendant des essais.
export function envoiReelActif(): boolean {
  return (
    process.env.EMAILS_ENVOI_REEL === "true" &&
    Boolean(process.env.GMAIL_ADRESSE) &&
    Boolean(process.env.GMAIL_MOT_DE_PASSE_APPLI)
  );
}

/// Gmail plafonne un compte gratuit à environ 500 destinataires par 24 h ;
/// au-delà, le compte est bloqué une journée. On s'arrête avant.
export const LIMITE_ENVOIS_24H = 400;

export type MessageAEnvoyer = {
  destinataire: string;
  sujet: string;
  corps: string;
  /// Version conservée dans l'historique quand le corps contient un secret
  /// (lien personnel) : on ne garde pas le lien en clair en base.
  corpsJournal?: string;
  templateId?: string;
  learnerId?: string;
  companyId?: string;
  sessionId?: string;
  prospectId?: string;
  automationRunId?: string;
  createdById?: string;
  /// Fichiers joints. Ils ne sont pas recopiés en base : l'historique garde
  /// seulement leur nom, dans le corps journalisé.
  piecesJointes?: PieceJointe[];
};

export type PieceJointe = { nom: string; contenu: Uint8Array; typeMime: string };

const EMAIL_VALIDE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let transporteur: Transporter | undefined;

function gmail(): Transporter {
  transporteur ??= nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: process.env.GMAIL_ADRESSE,
      // Google affiche le mot de passe d'application par groupes de 4 : on retire les espaces.
      pass: (process.env.GMAIL_MOT_DE_PASSE_APPLI ?? "").replace(/\s+/g, ""),
    },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  });
  return transporteur;
}

function motifLisible(erreur: unknown): string {
  const e = erreur as { code?: string; responseCode?: number; response?: string };
  if (e.code === "EAUTH") {
    return "Gmail refuse la connexion : adresse ou mot de passe d'application incorrect.";
  }
  if (e.response?.includes("5.4.5") || e.response?.toLowerCase().includes("limit")) {
    return "Limite d'envoi quotidienne de Gmail atteinte : réessayer demain.";
  }
  if (e.responseCode && e.responseCode >= 500) {
    return `Refusé par Gmail (${e.responseCode}) : ${e.response ?? "motif inconnu"}`;
  }
  return "Gmail injoignable pour le moment.";
}

/// Envoie (ou simule) un email et l'enregistre dans l'historique.
/// Ne lève jamais d'exception : un échec est enregistré avec son motif, pour
/// qu'une action métier ne soit pas annulée parce qu'un email n'est pas parti.
export async function envoyerEmail(message: MessageAEnvoyer) {
  const jointes = message.piecesJointes ?? [];
  const mentionJointes = jointes.length > 0 ? `\n\n— Pièce(s) jointe(s) : ${jointes.map((j) => j.nom).join(", ")}` : "";
  const base = {
    destinataire: message.destinataire,
    sujet: message.sujet,
    corps: (message.corpsJournal ?? message.corps) + mentionJointes,
    templateId: message.templateId,
    learnerId: message.learnerId,
    companyId: message.companyId,
    sessionId: message.sessionId,
    prospectId: message.prospectId,
    automationRunId: message.automationRunId,
    createdById: message.createdById,
  };

  if (!EMAIL_VALIDE.test(message.destinataire)) {
    return prisma.email.create({
      data: { ...base, statut: "ECHEC", erreur: "Adresse email invalide." },
    });
  }

  if (!envoiReelActif()) {
    return prisma.email.create({ data: { ...base, statut: "SIMULE" } });
  }

  try {
    const envoyesRecemment = await prisma.email.count({
      where: { statut: "ENVOYE", envoyeAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) } },
    });
    if (envoyesRecemment >= LIMITE_ENVOIS_24H) {
      return prisma.email.create({
        data: {
          ...base,
          statut: "ECHEC",
          erreur: `Limite de sécurité atteinte (${LIMITE_ENVOIS_24H} emails en 24 h) : réessayer plus tard.`,
        },
      });
    }

    // Identifiant généré avant l'envoi pour pouvoir l'intégrer au pixel de
    // suivi d'ouverture : il devient l'id de la ligne créée ci-dessous.
    const id = randomUUID();
    const expediteur = process.env.GMAIL_NOM_EXPEDITEUR || (await lireOrganisme()).raisonSociale;
    const info = await gmail().sendMail({
      from: { name: expediteur, address: process.env.GMAIL_ADRESSE ?? "" },
      to: message.destinataire,
      subject: message.sujet,
      text: message.corps,
      html: texteVersHtml(message.corps) + pixelSuivi(id),
      attachments: jointes.map((j) => ({ filename: j.nom, content: Buffer.from(j.contenu), contentType: j.typeMime })),
    });

    if ((info.rejected ?? []).length > 0) {
      return prisma.email.create({
        data: { ...base, statut: "ECHEC", erreur: "Adresse refusée par Gmail." },
      });
    }

    return prisma.email.create({
      data: { id, ...base, statut: "ENVOYE", fournisseurId: info.messageId },
    });
  } catch (erreur) {
    console.error("Envoi d'email impossible :", erreur);
    return prisma.email.create({
      data: { ...base, statut: "ECHEC", erreur: motifLisible(erreur) },
    });
  }
}
