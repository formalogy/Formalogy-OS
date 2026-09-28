import "server-only";

import type { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

import { enregistrerFeuilleSignee, formatFeuilleAccepte, joursSansFeuille } from "@/lib/emargement-feuilles";
import { prisma } from "@/lib/prisma";
import { emailAuthentifiePour } from "@/lib/signatures/authentification";

/// Taille maximale d'une réponse examinée : quelques photos de feuilles.
const TAILLE_MAX_REPONSE = 25 * 1024 * 1024;
/// Modèles dont une réponse du formateur peut porter une feuille signée.
const MODELES_EMARGEMENT = ["EMARGEMENT_JOUR", "EMARGEMENT_RELANCE"];

const identifiant = (id: string) => id.trim().replace(/^<?/, "<").replace(/>?$/, ">").toLowerCase();

/// Jour (minuit UTC) correspondant à un instant, en heure de Paris.
function jourDeParis(instant: Date): Date {
  return new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(instant)}T00:00:00.000Z`);
}

/// Range les feuilles d'émargement signées que les formateurs renvoient en
/// répondant à l'email du matin (ou à une relance). La réponse est reconnue
/// par l'identifiant de notre email qu'elle cite (« In-Reply-To ») : la
/// session et le jour en découlent, sans rien demander au formateur. Elle
/// n'est acceptée que venant de l'adresse à laquelle l'email a été envoyé, et
/// authentifiée par Gmail. Chaque réponse n'est examinée qu'une fois.
export async function rangerReponsesEmargement(client: ImapFlow, depuis: Date): Promise<{ examinees: number; rangees: number }> {
  const bilan = { examinees: 0, rangees: 0 };
  const envoyes = await prisma.email.findMany({
    where: {
      envoyeAt: { gte: depuis },
      fournisseurId: { not: null },
      sessionId: { not: null },
      template: { code: { in: MODELES_EMARGEMENT } },
    },
    select: { fournisseurId: true, sessionId: true, envoyeAt: true, destinataire: true, template: { select: { code: true } } },
  });
  if (envoyes.length === 0) return bilan;
  const parIdentifiant = new Map(envoyes.map((e) => [identifiant(e.fournisseurId!), e]));

  const uids = await client.search({ since: depuis }, { uid: true });
  if (!uids || uids.length === 0) return bilan;
  const enTetes = await client.fetchAll(uids, { envelope: true, size: true }, { uid: true });
  const reponses = enTetes.filter(
    (m) => m.envelope?.messageId && m.envelope.inReplyTo && parIdentifiant.has(identifiant(m.envelope.inReplyTo)) && (m.size ?? 0) <= TAILLE_MAX_REPONSE,
  );
  if (reponses.length === 0) return bilan;
  const connues = new Set(
    (
      await prisma.emailEntrant.findMany({
        where: { messageId: { in: reponses.map((m) => m.envelope!.messageId!) } },
        select: { messageId: true },
      })
    ).map((e) => e.messageId),
  );

  for (const entete of reponses.filter((m) => !connues.has(m.envelope!.messageId!))) {
    const message = await client.fetchOne(String(entete.uid), { source: true }, { uid: true });
    if (!message || !message.source) continue;
    const mail = await simpleParser(message.source);
    const envoi = parIdentifiant.get(identifiant(entete.envelope!.inReplyTo!))!;
    const expediteur = (mail.from?.value[0]?.address ?? "").toLowerCase();
    const trace = {
      messageId: entete.envelope!.messageId!,
      expediteur: mail.from?.text ?? expediteur,
      sujet: mail.subject ?? "",
      recuAt: mail.date ?? new Date(entete.envelope?.date ?? Date.now()),
    };
    bilan.examinees++;

    const ignorer = (motif: string) => prisma.emailEntrant.create({ data: { ...trace, resultat: "IGNORE", motif } });
    if (expediteur !== envoi.destinataire.toLowerCase()) {
      await ignorer("Réponse venant d'une autre adresse que celle du formateur");
      continue;
    }
    if (!emailAuthentifiePour(mail.headerLines, expediteur.split("@")[1] ?? "")) {
      await ignorer("Expéditeur non authentifié par Gmail");
      continue;
    }
    const fichiers = mail.attachments
      .filter((a) => formatFeuilleAccepte(a.contentType))
      .map((a) => ({ nom: a.filename ?? "feuille", typeMime: a.contentType, octets: new Uint8Array(a.content) }));
    if (fichiers.length === 0) {
      await ignorer("Réponse sans feuille jointe (PDF ou photo)");
      continue;
    }

    // La réponse à l'email du matin porte la feuille de ce jour-là. Celle à
    // une relance n'est attribuée que si un seul jour manquait : sinon on ne
    // devine pas, la feuille se dépose à la main.
    const session = await prisma.trainingSession.findUnique({ where: { id: envoi.sessionId! }, select: { id: true, dateDebut: true, dateFin: true } });
    if (!session) {
      await ignorer("Session supprimée");
      continue;
    }
    let jour = jourDeParis(envoi.envoyeAt);
    if (envoi.template?.code === "EMARGEMENT_RELANCE") {
      const manquants = await joursSansFeuille(session, jour);
      if (manquants.length !== 1) {
        await ignorer(`Réponse à une relance couvrant ${manquants.length} jours : feuille à déposer à la main`);
        continue;
      }
      jour = manquants[0];
    }

    const r = await enregistrerFeuilleSignee({ sessionId: session.id, jour, fichiers, origine: "EMAIL" });
    if ("erreur" in r) {
      await ignorer(r.erreur);
      continue;
    }
    await prisma.emailEntrant.create({ data: { ...trace, resultat: "RAPPROCHE", motif: "Feuille d'émargement signée rangée" } });
    bilan.rangees++;
  }
  return bilan;
}
