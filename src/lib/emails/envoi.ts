import "server-only";

import { texteVersHtml } from "@/lib/emails/modeles";
import { prisma } from "@/lib/prisma";

/// Deux modes :
/// - simulation (par défaut) : l'email est enregistré dans l'historique avec le
///   statut SIMULE, rien ne quitte l'application ;
/// - envoi réel : uniquement si EMAILS_ENVOI_REEL vaut exactement « true » ET
///   que la clé Resend et l'adresse d'expédition sont renseignées.
///
/// Ce verrou évite qu'un apprenant réel reçoive un message pendant des essais.
export function envoiReelActif(): boolean {
  return (
    process.env.EMAILS_ENVOI_REEL === "true" &&
    Boolean(process.env.RESEND_API_KEY) &&
    Boolean(process.env.EMAIL_FROM)
  );
}

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
    const reponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [message.destinataire],
        subject: message.sujet,
        text: message.corps,
        html: texteVersHtml(message.corps),
      }),
      signal: AbortSignal.timeout(15000),
    });

    const donnees = (await reponse.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!reponse.ok || !donnees.id) {
      return prisma.email.create({
        data: {
          ...base,
          statut: "ECHEC",
          erreur: `Refusé par le prestataire (${reponse.status}) : ${donnees.message ?? "motif inconnu"}`,
        },
      });
    }

    return prisma.email.create({
      data: { ...base, statut: "ENVOYE", fournisseurId: donnees.id },
    });
  } catch (erreur) {
    console.error("Envoi d'email impossible :", erreur);
    return prisma.email.create({
      data: { ...base, statut: "ECHEC", erreur: "Prestataire d'envoi injoignable." },
    });
  }
}
