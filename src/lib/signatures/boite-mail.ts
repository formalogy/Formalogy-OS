import "server-only";

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

import { prisma } from "@/lib/prisma";
import { emailAuthentifieBoldSign } from "@/lib/signatures/authentification";
import { rapprocherEmail, type ResultatRapprochement } from "@/lib/signatures/rapprochement";

/// Les emails plus anciens sont supposés déjà examinés.
const JOURS_EXAMINES = 30;
/// Un email de fin de signature pèse au plus quelques Mo (pièces jointes
/// limitées à 5 Mo par BoldSign).
const TAILLE_MAX_EMAIL = 25 * 1024 * 1024;

export function boiteConfiguree(): boolean {
  return Boolean(process.env.GMAIL_ADRESSE && process.env.GMAIL_MOT_DE_PASSE_APPLI);
}

export type BilanReleve = {
  examines: number;
  rapproches: number;
  aVerifier: number;
  erreur?: string;
};

/// Relève la boîte Gmail dédiée et rattache les documents signés reçus de
/// BoldSign. Lecture seule : aucun email n'est modifié, déplacé ni supprimé.
/// Ne lève jamais d'exception.
export async function releverBoite(): Promise<BilanReleve> {
  const bilan: BilanReleve = { examines: 0, rapproches: 0, aVerifier: 0 };
  if (!boiteConfiguree()) return { ...bilan, erreur: "La boîte Gmail dédiée n'est pas encore configurée." };

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: {
      user: process.env.GMAIL_ADRESSE!,
      pass: process.env.GMAIL_MOT_DE_PASSE_APPLI!.replace(/\s+/g, ""),
    },
    logger: false,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 60000,
  });

  try {
    await client.connect();
    const verrou = await client.getMailboxLock("INBOX", { readOnly: true });
    try {
      const depuis = new Date(Date.now() - JOURS_EXAMINES * 86400000);
      const uids = await client.search({ from: "boldsign.com", since: depuis }, { uid: true });
      if (!uids || uids.length === 0) return bilan;

      // D'abord les identifiants, pour ne télécharger que les emails nouveaux.
      const enTetes = await client.fetchAll(uids, { envelope: true, size: true }, { uid: true });
      const connus = new Set(
        (
          await prisma.emailEntrant.findMany({
            where: { messageId: { in: enTetes.map((m) => m.envelope?.messageId).filter((id): id is string => Boolean(id)) } },
            select: { messageId: true },
          })
        ).map((e) => e.messageId),
      );
      const nouveaux = enTetes.filter((m) => m.envelope?.messageId && !connus.has(m.envelope.messageId) && (m.size ?? 0) <= TAILLE_MAX_EMAIL);

      for (const entete of nouveaux) {
        const message = await client.fetchOne(String(entete.uid), { source: true }, { uid: true });
        if (!message || !message.source) continue;
        const mail = await simpleParser(message.source);

        const resultat: ResultatRapprochement = await rapprocherEmail({
          messageId: entete.envelope!.messageId!,
          expediteur: mail.from?.text ?? "",
          sujet: mail.subject ?? "",
          recuAt: mail.date ?? new Date(entete.envelope?.date ?? Date.now()),
          authentifieBoldSign: emailAuthentifieBoldSign(mail.headerLines),
          piecesJointes: mail.attachments.map((a) => ({
            nom: a.filename ?? "piece-jointe",
            typeMime: a.contentType,
            octets: new Uint8Array(a.content),
          })),
        });

        bilan.examines++;
        if (resultat.resultat === "RAPPROCHE") bilan.rapproches++;
        if (resultat.resultat === "A_VERIFIER") bilan.aVerifier++;
      }
    } finally {
      verrou.release();
    }
    return bilan;
  } catch (erreur) {
    console.error("Relève de la boîte Gmail impossible :", erreur);
    const e = erreur as { authenticationFailed?: boolean };
    return {
      ...bilan,
      erreur: e.authenticationFailed
        ? "Gmail refuse la connexion : adresse ou mot de passe d'application incorrect."
        : "Gmail injoignable pour le moment.",
    };
  } finally {
    // Déconnexion propre si possible, sinon coupure : une connexion restée
    // ouverte bloquerait le traitement suivant.
    if (client.usable) await client.logout().catch(() => undefined);
    client.close();
  }
}
