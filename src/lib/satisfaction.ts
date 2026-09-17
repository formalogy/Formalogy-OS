import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { construireContexte } from "@/lib/emails/contexte";
import { envoyerEmail } from "@/lib/emails/envoi";
import { rendre } from "@/lib/emails/modeles";
import { prisma } from "@/lib/prisma";

/// Durée de validité d'un lien de questionnaire.
const JOURS_VALIDITE = 60;

export const empreinteJeton = (jeton: string) => createHash("sha256").update(jeton).digest("hex");

function adresseApplication(): string {
  return (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/// Prépare le lien personnel d'un apprenant vers le questionnaire d'une
/// session. Un nouveau jeton est créé à chaque appel : seul le dernier lien
/// envoyé fonctionne, les précédents deviennent invalides. Renvoie null si
/// l'apprenant a déjà répondu.
export async function preparerLienQuestionnaire(sessionId: string, learnerId: string): Promise<string | null> {
  const existant = await prisma.questionnaireSatisfaction.findUnique({
    where: { sessionId_learnerId: { sessionId, learnerId } },
  });
  if (existant?.reponduAt) return null;

  // 32 octets aléatoires : impossible à deviner. Seule l'empreinte est gardée.
  const jeton = randomBytes(32).toString("base64url");
  const donnees = {
    jetonEmpreinte: empreinteJeton(jeton),
    expireAt: new Date(Date.now() + JOURS_VALIDITE * 86400000),
    envoyeAt: new Date(),
  };
  await prisma.questionnaireSatisfaction.upsert({
    where: { sessionId_learnerId: { sessionId, learnerId } },
    create: { sessionId, learnerId, ...donnees },
    update: donnees,
  });
  return `${adresseApplication()}/questionnaire/${jeton}`;
}

/// Questionnaire correspondant à un jeton, s'il est encore utilisable.
export async function questionnaireParJeton(jeton: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(jeton)) return null;
  const q = await prisma.questionnaireSatisfaction.findUnique({
    where: { jetonEmpreinte: empreinteJeton(jeton) },
    include: {
      learner: { select: { prenom: true, deletedAt: true } },
      session: { select: { dateDebut: true, dateFin: true, deletedAt: true, formation: { select: { titre: true } } } },
    },
  });
  if (!q || q.learner.deletedAt || q.session.deletedAt) return null;
  return q;
}

/// Envoie (ou simule, selon le verrou d'envoi) le questionnaire aux inscrits
/// d'une session qui ont une adresse email et n'ont pas encore répondu.
export async function envoyerQuestionnaires(sessionId: string, userId: string) {
  const modele = await prisma.emailTemplate.findUnique({ where: { code: "SATISFACTION" } });
  if (!modele?.actif) return { erreur: "Le modèle d'email « Demande d'avis » est introuvable ou désactivé (Paramètres → Modèles d'emails)." };
  if (!`${modele.sujet}${modele.corps}`.includes("questionnaire.lien")) {
    return { erreur: "Le modèle « Demande d'avis » ne contient pas la variable {{questionnaire.lien}}." };
  }

  const inscriptions = await prisma.sessionLearner.findMany({
    where: { sessionId, learner: { deletedAt: null } },
    select: { learner: { select: { id: true, email: true, companyId: true } } },
  });

  const bilan = { envoyes: 0, simules: 0, sansAdresse: 0, dejaRepondu: 0, echecs: 0 };
  for (const { learner } of inscriptions) {
    if (!learner.email) {
      bilan.sansAdresse++;
      continue;
    }
    const lien = await preparerLienQuestionnaire(sessionId, learner.id);
    if (!lien) {
      bilan.dejaRepondu++;
      continue;
    }
    const contexte = await construireContexte({ learnerId: learner.id, sessionId, companyId: learner.companyId ?? undefined, lienQuestionnaire: lien });
    const email = await envoyerEmail({
      destinataire: learner.email,
      sujet: rendre(modele.sujet, contexte).resultat,
      corps: rendre(modele.corps, contexte).resultat,
      corpsJournal: rendre(modele.corps, { ...contexte, "questionnaire.lien": "[lien personnel masqué]" }).resultat,
      templateId: modele.id,
      learnerId: learner.id,
      sessionId,
      companyId: learner.companyId ?? undefined,
      createdById: userId,
    });
    if (email.statut === "SIMULE") bilan.simules++;
    else if (email.statut === "ECHEC") bilan.echecs++;
    else bilan.envoyes++;
  }
  return { bilan };
}
