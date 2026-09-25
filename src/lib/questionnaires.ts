import "server-only";

import { randomBytes } from "node:crypto";

import type { ResultatAcquis, TypeQuestionnaire } from "@prisma/client";

import { construireContexte } from "@/lib/emails/contexte";
import { envoyerEmail } from "@/lib/emails/envoi";
import { rendre } from "@/lib/emails/modeles";
import { prisma } from "@/lib/prisma";
import { LIBELLE_TYPE_QUESTIONNAIRE, RESULTATS_ACQUIS, type EvaluationDemandee } from "@/lib/questionnaires-questions";
import { empreinteJeton } from "@/lib/satisfaction";

/// Durée de validité d'un lien de questionnaire, comme pour la satisfaction.
const JOURS_VALIDITE = 60;

function adresseApplication(): string {
  return (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export type DestinataireQuestionnaire =
  | { type: "POSITIONNEMENT"; sessionId: string; learnerId: string }
  | { type: "FROID"; sessionId: string; learnerId: string }
  | { type: "CHAUD_FORMATEUR"; sessionId: string; trainerId: string }
  | { type: "FINANCEUR"; dossierFinancementId: string }
  | { type: "SATISFACTION_FORMATEUR"; trainerId: string };

function filtreDestinataire(dest: DestinataireQuestionnaire) {
  if (dest.type === "POSITIONNEMENT" || dest.type === "FROID") {
    return { type: dest.type, sessionId: dest.sessionId, learnerId: dest.learnerId };
  }
  if (dest.type === "CHAUD_FORMATEUR") {
    return { type: dest.type, sessionId: dest.sessionId, trainerId: dest.trainerId };
  }
  if (dest.type === "FINANCEUR") {
    return { type: dest.type, dossierFinancementId: dest.dossierFinancementId };
  }
  return { type: dest.type, trainerId: dest.trainerId, sessionId: null };
}

/// Prépare le lien personnel d'un questionnaire qualité. Un nouveau jeton est
/// créé à chaque appel : seul le dernier lien envoyé fonctionne. Renvoie null
/// si ce destinataire a déjà répondu pour ce type.
export async function preparerLienQuestionnaireQualite(dest: DestinataireQuestionnaire): Promise<string | null> {
  const filtre = filtreDestinataire(dest);
  const existant = await prisma.questionnaire.findFirst({ where: filtre });
  if (existant?.reponduAt) return null;

  const jeton = randomBytes(32).toString("base64url");
  const donnees = {
    jetonEmpreinte: empreinteJeton(jeton),
    expireAt: new Date(Date.now() + JOURS_VALIDITE * 86400000),
    envoyeAt: new Date(),
  };

  if (existant) {
    await prisma.questionnaire.update({ where: { id: existant.id }, data: donnees });
  } else {
    await prisma.questionnaire.create({
      data: {
        type: dest.type,
        sessionId: "sessionId" in dest ? dest.sessionId : null,
        learnerId: "learnerId" in dest ? dest.learnerId : null,
        trainerId: "trainerId" in dest ? dest.trainerId : null,
        dossierFinancementId: "dossierFinancementId" in dest ? dest.dossierFinancementId : null,
        ...donnees,
      },
    });
  }
  return `${adresseApplication()}/questionnaires/${jeton}`;
}

/// Questionnaire correspondant à un jeton, s'il est encore utilisable.
export async function questionnaireQualiteParJeton(jeton: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(jeton)) return null;
  const q = await prisma.questionnaire.findUnique({
    where: { jetonEmpreinte: empreinteJeton(jeton) },
    include: {
      learner: { select: { prenom: true, nom: true, deletedAt: true } },
      trainer: { select: { prenom: true, nom: true, deletedAt: true } },
      dossier: { select: { financeurNom: true } },
      session: { select: { numero: true, dateDebut: true, dateFin: true, deletedAt: true, formation: { select: { titre: true } } } },
    },
  });
  if (!q) return null;
  if (q.learner?.deletedAt || q.trainer?.deletedAt || q.session?.deletedAt) return null;
  return q;
}

/// Le bilan de fin de session du formateur porte l'évaluation des acquis de
/// chaque inscrit (décision du client : elle est transmise par le formateur
/// en fin de parcours). Null pour tout autre questionnaire.
export async function evaluationDemandee(q: { type: TypeQuestionnaire; sessionId: string | null }): Promise<EvaluationDemandee | null> {
  if (q.type !== "CHAUD_FORMATEUR" || !q.sessionId) return null;
  const [inscriptions, evaluations] = await Promise.all([
    prisma.sessionLearner.findMany({
      where: { sessionId: q.sessionId, learner: { deletedAt: null } },
      orderBy: [{ learner: { nom: "asc" } }, { learner: { prenom: "asc" } }],
      select: { learner: { select: { id: true, prenom: true, nom: true } } },
    }),
    prisma.evaluationAcquis.findMany({ where: { sessionId: q.sessionId }, select: { learnerId: true, resultat: true, commentaire: true } }),
  ]);
  return {
    apprenants: inscriptions.map((i) => ({ id: i.learner.id, nom: `${i.learner.prenom} ${i.learner.nom}` })),
    existantes: Object.fromEntries(evaluations.map((e) => [e.learnerId, { resultat: e.resultat, commentaire: e.commentaire }])),
  };
}

/// Lit l'évaluation des acquis envoyée par le formateur : un résultat par
/// apprenant, obligatoire, et un commentaire facultatif.
export function lireEvaluation(
  evaluation: EvaluationDemandee,
  donnees: FormData,
): { lignes: { learnerId: string; resultat: ResultatAcquis; commentaire: string | null }[] } | { erreur: string; valeurs: Record<string, string> } {
  const valeurs: Record<string, string> = {};
  const lignes: { learnerId: string; resultat: ResultatAcquis; commentaire: string | null }[] = [];
  let manquant: string | undefined;
  for (const apprenant of evaluation.apprenants) {
    const resultat = String(donnees.get(`acquis_${apprenant.id}`) ?? "");
    const commentaire = String(donnees.get(`commentaire_${apprenant.id}`) ?? "").trim().slice(0, 300);
    valeurs[`acquis_${apprenant.id}`] = resultat;
    valeurs[`commentaire_${apprenant.id}`] = commentaire;
    if (!RESULTATS_ACQUIS.includes(resultat as ResultatAcquis)) manquant ??= apprenant.nom;
    else lignes.push({ learnerId: apprenant.id, resultat: resultat as ResultatAcquis, commentaire: commentaire || null });
  }
  if (manquant) return { erreur: `Merci d'évaluer les acquis de ${manquant}.`, valeurs };
  return { lignes };
}

/// Variable de contexte email portant le lien, par type de questionnaire —
/// le code du modèle d'email attendu est le type lui-même (ex. « FINANCEUR »).
const CONTEXTE_LIEN: Record<TypeQuestionnaire, keyof Parameters<typeof construireContexte>[0]> = {
  POSITIONNEMENT: "lienPositionnement",
  CHAUD_FORMATEUR: "lienChaudFormateur",
  FROID: "lienFroid",
  FINANCEUR: "lienFinanceur",
  SATISFACTION_FORMATEUR: "lienSatisfactionFormateur",
};

/// Envoi manuel (hors automatisation) d'un questionnaire qualité à un
/// destinataire précis : apprenant, formateur ou financeur selon le type.
export async function envoyerQuestionnaireQualite(
  dest: DestinataireQuestionnaire,
  userId: string,
): Promise<{ erreur?: string; succes?: string }> {
  const modele = await prisma.emailTemplate.findUnique({ where: { code: dest.type } });
  if (!modele?.actif) {
    return { erreur: `Le modèle d'email « ${LIBELLE_TYPE_QUESTIONNAIRE[dest.type]} » est introuvable ou désactivé (Paramètres → Modèles d'emails).` };
  }

  const [destinataireEmail, destinataireNom, learnerId, trainerId] = await resoudreDestinataire(dest);
  if (!destinataireEmail) return { erreur: `${destinataireNom ?? "Ce destinataire"} n'a pas d'adresse email enregistrée.` };

  const lien = await preparerLienQuestionnaireQualite(dest);
  if (!lien) return { erreur: `${destinataireNom} a déjà répondu à ce questionnaire.` };

  const dossierId = dest.type === "FINANCEUR" ? dest.dossierFinancementId : undefined;
  const sessionId = "sessionId" in dest ? dest.sessionId : undefined;
  const cle = CONTEXTE_LIEN[dest.type];
  const idsContexte: Parameters<typeof construireContexte>[0] = { learnerId, trainerId, sessionId, dossierId };
  idsContexte[cle] = lien;
  const contexte = await construireContexte(idsContexte);
  const email = await envoyerEmail({
    destinataire: destinataireEmail,
    sujet: rendre(modele.sujet, contexte).resultat,
    corps: rendre(modele.corps, contexte).resultat,
    corpsJournal: rendre(modele.corps, { ...contexte, [`questionnaire.${cle}`]: "[lien personnel masqué]" }).resultat,
    templateId: modele.id,
    learnerId,
    sessionId,
    createdById: userId,
  });

  if (email.statut === "ECHEC") return { erreur: `L'email n'est pas parti : ${email.erreur}` };
  return { succes: email.statut === "SIMULE" ? "Questionnaire enregistré (simulation)." : "Questionnaire envoyé." };
}

async function resoudreDestinataire(
  dest: DestinataireQuestionnaire,
): Promise<[email: string | null, nom: string | null, learnerId: string | undefined, trainerId: string | undefined]> {
  if (dest.type === "POSITIONNEMENT" || dest.type === "FROID") {
    const apprenant = await prisma.learner.findFirst({ where: { id: dest.learnerId, deletedAt: null } });
    if (!apprenant) return [null, "Apprenant introuvable", undefined, undefined];
    return [apprenant.email, `${apprenant.prenom} ${apprenant.nom}`, apprenant.id, undefined];
  }
  if (dest.type === "FINANCEUR") {
    const dossier = await prisma.dossierFinancement.findUnique({ where: { id: dest.dossierFinancementId } });
    if (!dossier) return [null, "Dossier introuvable", undefined, undefined];
    return [dossier.email, dossier.financeurNom, undefined, undefined];
  }
  const formateur = await prisma.trainer.findFirst({ where: { id: dest.trainerId, deletedAt: null } });
  if (!formateur) return [null, "Formateur introuvable", undefined, undefined];
  return [formateur.email, `${formateur.prenom} ${formateur.nom}`, undefined, formateur.id];
}
