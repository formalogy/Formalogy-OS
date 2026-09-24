import "server-only";

import { z } from "zod";

import { prisma } from "@/lib/prisma";
import {
  QUESTIONNAIRES_ORIGINE,
  TYPES_QUESTION,
  type CodeQuestionnaire,
  type ContenuQuestionnaire,
  type Question,
  type ReponsesQuestionnaire,
} from "@/lib/questionnaires-questions";

const EST_CHOIX = new Set(["CHOIX_UNIQUE", "CHOIX_MULTIPLE"]);

/// Une question telle qu'elle est enregistrée : les champs sans objet pour
/// son type sont retirés, pour qu'un questionnaire relu soit toujours propre.
const schemaQuestion = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9_]{1,40}$/),
    type: z.enum(TYPES_QUESTION),
    libelle: z.string().trim().min(1, "Une question n'a pas d'intitulé.").max(500, "Un intitulé dépasse 500 caractères."),
    options: z.array(z.string().trim().max(200, "Une case dépasse 200 caractères.")).optional(),
    obligatoire: z.boolean().optional(),
    section: z.string().trim().max(200).optional(),
    globale: z.boolean().optional(),
  })
  .transform((q, ctx): Question => {
    const propre: Question = { id: q.id, type: q.type, libelle: q.libelle };
    if (EST_CHOIX.has(q.type)) {
      const options = [...new Set((q.options ?? []).filter(Boolean))];
      if (options.length < 2) ctx.addIssue({ code: "custom", message: `« ${q.libelle} » doit proposer au moins deux cases.` });
      if (options.length > 15) ctx.addIssue({ code: "custom", message: `« ${q.libelle} » propose plus de 15 cases.` });
      propre.options = options;
    }
    if (q.obligatoire) propre.obligatoire = true;
    if (q.section) propre.section = q.section;
    if (q.globale && q.type === "NOTE") propre.globale = true;
    return propre;
  });

const schemaQuestions = z
  .array(schemaQuestion)
  .min(1, "Un questionnaire doit contenir au moins une question.")
  .max(60, "Un questionnaire ne peut pas dépasser 60 questions.")
  .superRefine((questions, ctx) => {
    if (new Set(questions.map((q) => q.id)).size !== questions.length) {
      ctx.addIssue({ code: "custom", message: "Deux questions portent le même identifiant." });
    }
    if (questions.filter((q) => q.globale).length > 1) {
      ctx.addIssue({ code: "custom", message: "Une seule note peut servir de satisfaction générale." });
    }
  });

export const schemaContenuQuestionnaire = z.object({
  titre: z.string().trim().min(1, "Le titre est obligatoire.").max(200),
  introduction: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((t) => t || undefined),
  questions: schemaQuestions,
});

/// Contenu en vigueur d'un questionnaire : celui modifié depuis l'application
/// s'il existe, sinon le questionnaire d'origine. Un contenu enregistré devenu
/// illisible (ne devrait jamais arriver) retombe sur l'origine plutôt que de
/// bloquer les réponses.
export async function lireContenuQuestionnaire(
  code: CodeQuestionnaire,
): Promise<{ contenu: ContenuQuestionnaire; modifieLe: Date | null }> {
  const ligne = await prisma.modeleQuestionnaire.findUnique({ where: { code } });
  if (!ligne) return { contenu: QUESTIONNAIRES_ORIGINE[code], modifieLe: null };
  const lu = schemaContenuQuestionnaire.safeParse({
    titre: ligne.titre,
    introduction: ligne.introduction ?? undefined,
    questions: ligne.questions,
  });
  if (!lu.success) {
    console.error(`Questionnaire ${code} enregistré illisible : questionnaire d'origine utilisé.`);
    return { contenu: QUESTIONNAIRES_ORIGINE[code], modifieLe: null };
  }
  return { contenu: lu.data, modifieLe: ligne.updatedAt };
}

/// Questions posées à un destinataire, telles que figées à sa réponse.
/// Faute de trace (réponse antérieure au figeage), les questions d'origine.
export function questionsPosees(figees: unknown, code: CodeQuestionnaire): Question[] {
  const lu = schemaQuestions.safeParse(figees);
  return lu.success ? lu.data : QUESTIONNAIRES_ORIGINE[code].questions;
}

/// Lit les réponses envoyées par le formulaire public et les contrôle au
/// regard des questions : une case cochée doit exister, une note aller de 1
/// à 5, une question obligatoire être remplie.
export function analyserReponses(
  questions: Question[],
  donnees: FormData,
): { reponses: ReponsesQuestionnaire } | { erreur: string; valeurs: Record<string, string | string[]> } {
  const reponses: ReponsesQuestionnaire = {};
  const valeurs: Record<string, string | string[]> = {};
  let manquante: Question | undefined;

  for (const question of questions) {
    if (question.type === "CHOIX_MULTIPLE") {
      const cochees = [...new Set(donnees.getAll(question.id).map(String))].filter((v) => question.options?.includes(v));
      valeurs[question.id] = cochees;
      if (cochees.length > 0) reponses[question.id] = cochees;
      else if (question.obligatoire) manquante ??= question;
      continue;
    }

    const brut = String(donnees.get(question.id) ?? "").trim();
    valeurs[question.id] = brut;
    if (question.type === "CHOIX_UNIQUE" && question.options?.includes(brut)) reponses[question.id] = brut;
    if (question.type === "NOTE" && /^[1-5]$/.test(brut)) reponses[question.id] = Number(brut);
    if (question.type === "TEXTE" && brut) reponses[question.id] = brut.slice(0, 2000);
    if (question.obligatoire && reponses[question.id] === undefined) manquante ??= question;
  }

  if (manquante) return { erreur: `Merci de répondre à la question « ${manquante.libelle} ».`, valeurs };
  return { reponses };
}

/// Note de satisfaction générale d'une réponse : la note désignée comme telle,
/// sinon la moyenne arrondie de toutes les notes données.
export function noteGlobale(questions: Question[], reponses: ReponsesQuestionnaire): number | null {
  const designee = questions.find((q) => q.globale);
  const valeur = designee ? reponses[designee.id] : undefined;
  if (typeof valeur === "number") return valeur;
  const notes = questions
    .filter((q) => q.type === "NOTE")
    .map((q) => reponses[q.id])
    .filter((n): n is number => typeof n === "number");
  return notes.length > 0 ? Math.round(notes.reduce((t, n) => t + n, 0) / notes.length) : null;
}

/// Notes détaillées (hors satisfaction générale) rencontrées dans une série de
/// réponses, chacune avec l'intitulé le plus récent. Les réponses doivent être
/// triées de la plus récente à la plus ancienne : un questionnaire modifié
/// entre-temps ne fait ainsi ni disparaître ni dédoubler une question.
export function notesDetaillees(figees: unknown[], code: CodeQuestionnaire): Question[] {
  const vues = new Map<string, Question>();
  for (const f of figees) {
    for (const q of questionsPosees(f, code)) {
      if (q.type === "NOTE" && !q.globale && !vues.has(q.id)) vues.set(q.id, q);
    }
  }
  return [...vues.values()];
}
