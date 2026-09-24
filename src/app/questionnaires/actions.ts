"use server";

import { prisma } from "@/lib/prisma";
import { questionnaireQualiteParJeton } from "@/lib/questionnaires";
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

  const { contenu } = await lireContenuQuestionnaire(q.type);
  const analyse = analyserReponses(contenu.questions, donnees);
  if ("erreur" in analyse) return { erreur: analyse.erreur, valeurs: analyse.valeurs, essai };

  // Les questions sont figées avec les réponses : une modification ultérieure
  // du questionnaire ne change pas le sens de ce qui a été répondu. La
  // condition « pas encore répondu » dans la mise à jour elle-même empêche
  // deux envois simultanés d'enregistrer deux réponses.
  await prisma.questionnaire.updateMany({
    where: { id: q.id, reponduAt: null },
    data: { reponses: analyse.reponses, questions: contenu.questions, reponduAt: new Date() },
  });
  return { merci: true };
}
