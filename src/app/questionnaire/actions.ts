"use server";

import { prisma } from "@/lib/prisma";
import { analyserReponses, lireContenuQuestionnaire, noteGlobale } from "@/lib/questionnaires-modeles";
import type { EtatReponse } from "@/lib/questionnaires-questions";
import { questionnaireParJeton } from "@/lib/satisfaction";

/// Réponse d'un apprenant au questionnaire de satisfaction, sans compte : le
/// jeton du lien fait office d'autorisation, pour ce seul questionnaire et une
/// seule fois.
export async function repondreQuestionnaire(precedent: EtatReponse, donnees: FormData): Promise<EtatReponse> {
  const essai = (precedent.essai ?? 0) + 1;
  const jeton = String(donnees.get("jeton") ?? "");
  const q = await questionnaireParJeton(jeton);
  if (!q || q.expireAt < new Date()) return { erreur: "Ce lien n'est plus valable.", essai };
  if (q.reponduAt) return { merci: true };

  const { contenu } = await lireContenuQuestionnaire("SATISFACTION");
  const analyse = analyserReponses(contenu.questions, donnees);
  if ("erreur" in analyse) return { erreur: analyse.erreur, valeurs: analyse.valeurs, essai };

  // Questions figées avec les réponses, comme pour les questionnaires qualité ;
  // la note générale est calculée une fois pour toutes, pour les statistiques.
  await prisma.questionnaireSatisfaction.updateMany({
    where: { id: q.id, reponduAt: null },
    data: {
      reponses: analyse.reponses,
      questions: contenu.questions,
      noteGlobale: noteGlobale(contenu.questions, analyse.reponses),
      reponduAt: new Date(),
    },
  });
  return { merci: true };
}
