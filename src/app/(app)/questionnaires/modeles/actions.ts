"use server";

import { revalidatePath } from "next/cache";

import { journaliser } from "@/lib/journal";
import { prisma } from "@/lib/prisma";
import { schemaContenuQuestionnaire } from "@/lib/questionnaires-modeles";
import {
  estCodeQuestionnaire,
  LIBELLE_QUESTIONNAIRE,
  QUESTIONNAIRES_ORIGINE,
  type ContenuQuestionnaire,
} from "@/lib/questionnaires-questions";
import { exigerRole } from "@/lib/session";

/// Le contenu renvoyé est celui désormais en vigueur : l'éditeur s'y aligne,
/// qu'il ait été nettoyé à l'enregistrement ou remplacé par l'origine.
export type EtatEditeur = { erreur?: string; succes?: string; contenu?: ContenuQuestionnaire; modifie?: boolean };

/// Enregistre le contenu modifié d'un questionnaire, ou revient à sa version
/// d'origine (bouton « Revenir au questionnaire d'origine »). Le contenu vaut
/// pour tous les questionnaires remplis ensuite, y compris ceux déjà envoyés
/// mais pas encore remplis ; les réponses déjà reçues gardent leurs questions.
export async function modifierQuestionnaire(_precedent: EtatEditeur, donnees: FormData): Promise<EtatEditeur> {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");
  const code = donnees.get("code");
  if (!estCodeQuestionnaire(code)) return { erreur: "Questionnaire inconnu." };

  if (donnees.get("operation") === "retablir") {
    await prisma.modeleQuestionnaire.deleteMany({ where: { code } });
    await journaliser({
      action: "questionnaire.template.reset",
      summary: `Questionnaire « ${LIBELLE_QUESTIONNAIRE[code]} » remis dans sa version d'origine`,
      entityType: "ModeleQuestionnaire",
      entityId: code,
      userId: utilisateur.id,
    });
    revalidatePath("/questionnaires/modeles", "layout");
    return { succes: "Questionnaire d'origine rétabli.", contenu: QUESTIONNAIRES_ORIGINE[code], modifie: false };
  }

  let brut: unknown;
  try {
    brut = JSON.parse(String(donnees.get("contenu") ?? ""));
  } catch {
    return { erreur: "Le contenu envoyé est illisible : rechargez la page et recommencez." };
  }
  const lu = schemaContenuQuestionnaire.safeParse(brut);
  if (!lu.success) return { erreur: lu.error.issues[0]?.message ?? "Le questionnaire contient une erreur." };

  const { titre, introduction, questions } = lu.data;
  await prisma.modeleQuestionnaire.upsert({
    where: { code },
    create: { code, titre, introduction: introduction ?? null, questions },
    update: { titre, introduction: introduction ?? null, questions },
  });
  await journaliser({
    action: "questionnaire.template.updated",
    summary: `Questionnaire « ${LIBELLE_QUESTIONNAIRE[code]} » modifié (${questions.length} question${questions.length > 1 ? "s" : ""})`,
    entityType: "ModeleQuestionnaire",
    entityId: code,
    userId: utilisateur.id,
  });
  revalidatePath("/questionnaires/modeles", "layout");
  return { succes: "Questionnaire enregistré.", contenu: lu.data, modifie: true };
}
