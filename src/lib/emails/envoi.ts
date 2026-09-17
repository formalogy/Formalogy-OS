import "server-only";

import nodemailer, { type Transporter } from "nodemailer";

import { texteVersHtml } from "@/lib/emails/modeles";
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
  templateId?: string;
  learnerId?: string;
  companyId?: string;
  sessionId?: string;
  prospectId?: string;
  automationRunId?: string;
  createdById?: string;
};

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
  const base = {
    destinataire: message.destinataire,
    sujet: message.sujet,
    corps: message.corps,
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

    const expediteur = process.env.GMAIL_NOM_EXPEDITEUR || process.env.ORGANISME_NOM || "Formalogy";
    const info = await gmail().sendMail({
      from: { name: expediteur, address: process.env.GMAIL_ADRESSE ?? "" },
      to: message.destinataire,
      subject: message.sujet,
      text: message.corps,
      html: texteVersHtml(message.corps),
    });

    if ((info.rejected ?? []).length > 0) {
      return prisma.email.create({
        data: { ...base, statut: "ECHEC", erreur: "Adresse refusée par Gmail." },
      });
    }

    return prisma.email.create({
      data: { ...base, statut: "ENVOYE", fournisseurId: info.messageId },
    });
  } catch (erreur) {
    console.error("Envoi d'email impossible :", erreur);
    return prisma.email.create({
      data: { ...base, statut: "ECHEC", erreur: motifLisible(erreur) },
    });
  }
}
