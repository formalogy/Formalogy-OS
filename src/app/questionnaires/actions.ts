"use server";

import { prisma } from "@/lib/prisma";
import { questionnaireQualiteParJeton } from "@/lib/questionnaires";
import { QUESTIONS_QUESTIONNAIRE, type ReponsesQuestionnaire } from "@/lib/questionnaires-questions";

export type EtatQuestionnaireQualite = { erreur?: string; merci?: boolean };

/// Réponse d'un apprenant, formateur ou financeur, sans compte : le jeton du
/// lien fait office d'autorisation, pour ce seul questionnaire et une seule fois.
export async function repondreQuestionnaireQualite(
  _precedent: EtatQuestionnaireQualite,
  donnees: FormData,
): Promise<EtatQuestionnaireQualite> {
  const jeton = String(donnees.get("jeton") ?? "");
  const q = await questionnaireQualiteParJeton(jeton);
  if (!q || q.expireAt < new Date()) return { erreur: "Ce lien n'est plus valable." };
  if (q.reponduAt) return { merci: true };

  const reponses: ReponsesQuestionnaire = {};
  for (const question of QUESTIONS_QUESTIONNAIRE[q.type]) {
    if (question.type === "CASE") {
      reponses[question.code] = donnees.get(question.code) === "on";
    } else {
      const texte = String(donnees.get(question.code) ?? "").trim().slice(0, 2000);
      if (question.obligatoire && !texte) return { erreur: "Merci de répondre aux questions obligatoires." };
      if (texte) reponses[question.code] = texte;
    }
  }

  // Condition sur « pas encore répondu » dans la mise à jour elle-même : deux
  // envois simultanés ne peuvent pas enregistrer deux réponses.
  await prisma.questionnaire.updateMany({
    where: { id: q.id, reponduAt: null },
    data: { reponses, reponduAt: new Date() },
  });
  return { merci: true };
}
