"use server";

import { journaliser } from "@/lib/journal";
import { prisma } from "@/lib/prisma";
import { evaluationDemandee, lireEvaluation, questionnaireQualiteParJeton } from "@/lib/questionnaires";
import { analyserReponses, lireContenuQuestionnaire } from "@/lib/questionnaires-modeles";
import type { EtatReponse } from "@/lib/questionnaires-questions";

/// Réponse d'un apprenant, formateur ou financeur, sans compte : le jeton du
/// lien fait office d'autorisation, pour ce seul questionnaire et une seule fois.
export async function repondreQuestionnaireQualite(precedent: EtatReponse, donnees: FormData): Promise<EtatReponse> {
  const essai = (precedent.essai ?? 0) + 1;
  const jeton = String(donnees.get("jeton") ?? "");
  const q = await questionnaireQualiteParJeton(jeton);
  if (!q || q.expireAt < new Date()) return { erreur: "Ce lien n'est plus valable.", essai };
  if (q.reponduAt) return { merci: true };

  const [{ contenu }, evaluation] = await Promise.all([lireContenuQuestionnaire(q.type), evaluationDemandee(q)]);
  const analyse = analyserReponses(contenu.questions, donnees);
  const evaluations = evaluation ? lireEvaluation(evaluation, donnees) : { lignes: [] };
  if ("erreur" in analyse || "erreur" in evaluations) {
    return {
      erreur: "erreur" in analyse ? analyse.erreur : "erreur" in evaluations ? evaluations.erreur : undefined,
      valeurs: { ...("valeurs" in analyse ? analyse.valeurs : {}), ...("valeurs" in evaluations ? evaluations.valeurs : {}) },
      essai,
    };
  }

  // Les questions sont figées avec les réponses : une modification ultérieure
  // du questionnaire ne change pas le sens de ce qui a été répondu. La
  // condition « pas encore répondu » dans la mise à jour elle-même empêche
  // deux envois simultanés d'enregistrer deux réponses ; les évaluations ne
  // s'enregistrent qu'avec la réponse qui l'emporte.
  const enregistre = await prisma.$transaction(async (tx) => {
    const { count } = await tx.questionnaire.updateMany({
      where: { id: q.id, reponduAt: null },
      data: { reponses: analyse.reponses, questions: contenu.questions, reponduAt: new Date() },
    });
    if (count === 0 || !q.sessionId) return false;
    for (const ligne of evaluations.lignes) {
      await tx.evaluationAcquis.upsert({
        where: { sessionId_learnerId: { sessionId: q.sessionId, learnerId: ligne.learnerId } },
        create: { sessionId: q.sessionId, learnerId: ligne.learnerId, resultat: ligne.resultat, commentaire: ligne.commentaire },
        update: { resultat: ligne.resultat, commentaire: ligne.commentaire, saisieParId: null },
      });
    }
    return evaluations.lignes.length > 0;
  });

  if (enregistre && q.session) {
    await journaliser({
      action: "evaluations.received",
      summary: `Évaluation des acquis transmise par le formateur pour la session ${q.session.numero} (${evaluations.lignes.length} apprenant${evaluations.lignes.length > 1 ? "s" : ""})`,
      entityType: "TrainingSession",
      entityId: q.sessionId ?? undefined,
    });
  }
  return { merci: true };
}
