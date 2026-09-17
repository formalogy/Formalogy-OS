"use server";

import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { QUESTIONS_SATISFACTION, type ReponsesSatisfaction } from "@/lib/satisfaction-questions";
import { questionnaireParJeton } from "@/lib/satisfaction";

export type EtatQuestionnaire = { erreur?: string; merci?: boolean };

const note = z.coerce.number().int().min(1).max(5);

/// Réponse d'un apprenant, sans compte : le jeton du lien fait office
/// d'autorisation, pour ce seul questionnaire et une seule fois.
export async function repondreQuestionnaire(_precedent: EtatQuestionnaire, donnees: FormData): Promise<EtatQuestionnaire> {
  const jeton = String(donnees.get("jeton") ?? "");
  const q = await questionnaireParJeton(jeton);
  if (!q || q.expireAt < new Date()) return { erreur: "Ce lien n'est plus valable." };
  if (q.reponduAt) return { merci: true };

  const notes: Record<string, number> = {};
  for (const question of QUESTIONS_SATISFACTION) {
    const r = note.safeParse(donnees.get(question.cle));
    if (!r.success) return { erreur: "Merci de répondre à toutes les questions notées." };
    notes[question.cle] = r.data;
  }
  const globale = note.safeParse(donnees.get("globale"));
  if (!globale.success) return { erreur: "Merci d'indiquer votre satisfaction générale." };

  const texte = (cle: string) => String(donnees.get(cle) ?? "").trim().slice(0, 2000) || undefined;
  const reponses: ReponsesSatisfaction = {
    notes: notes as ReponsesSatisfaction["notes"],
    pointsForts: texte("pointsForts"),
    ameliorations: texte("ameliorations"),
  };

  // Condition sur « pas encore répondu » dans la mise à jour elle-même : deux
  // envois simultanés ne peuvent pas enregistrer deux réponses.
  await prisma.questionnaireSatisfaction.updateMany({
    where: { id: q.id, reponduAt: null },
    data: { reponses, noteGlobale: globale.data, reponduAt: new Date() },
  });
  return { merci: true };
}
