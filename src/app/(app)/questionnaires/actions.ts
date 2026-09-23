"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { journaliser } from "@/lib/journal";
import { envoyerQuestionnaireQualite, type DestinataireQuestionnaire } from "@/lib/questionnaires";
import { LIBELLE_TYPE_QUESTIONNAIRE } from "@/lib/questionnaires-questions";
import { exigerRole } from "@/lib/session";

export type EtatEnvoi = { erreur?: string; succes?: string };

const schema = z.object({
  type: z.enum(["POSITIONNEMENT", "CHAUD_FORMATEUR", "FROID", "FINANCEUR", "SATISFACTION_FORMATEUR"]),
  sessionId: z.string().trim().optional(),
  learnerId: z.string().trim().optional(),
  trainerId: z.string().trim().optional(),
  dossierFinancementId: z.string().trim().optional(),
});

/// Traduit la saisie du formulaire en destinataire typé : chaque type de
/// questionnaire exige ses propres champs, et eux seuls.
function lireDestinataire(v: z.infer<typeof schema>): DestinataireQuestionnaire | { erreur: string } {
  if (v.type === "POSITIONNEMENT" || v.type === "FROID") {
    if (!v.sessionId || !v.learnerId) return { erreur: "Choisissez une session et un apprenant." };
    return { type: v.type, sessionId: v.sessionId, learnerId: v.learnerId };
  }
  if (v.type === "CHAUD_FORMATEUR") {
    if (!v.sessionId || !v.trainerId) return { erreur: "Choisissez une session ayant un formateur." };
    return { type: v.type, sessionId: v.sessionId, trainerId: v.trainerId };
  }
  if (v.type === "FINANCEUR") {
    if (!v.dossierFinancementId) return { erreur: "Choisissez un dossier de prise en charge." };
    return { type: v.type, dossierFinancementId: v.dossierFinancementId };
  }
  if (!v.trainerId) return { erreur: "Choisissez un formateur." };
  return { type: v.type, trainerId: v.trainerId };
}

/// Envoi manuel d'un questionnaire qualité. L'envoi réel reste soumis au
/// verrou d'envoi des emails : sans lui, l'email est seulement enregistré.
export async function envoyerQuestionnaire(_precedent: EtatEnvoi, donnees: FormData): Promise<EtatEnvoi> {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");

  const saisie = schema.safeParse(Object.fromEntries(donnees.entries()));
  if (!saisie.success) return { erreur: "Choisissez un type de questionnaire." };

  const destinataire = lireDestinataire(saisie.data);
  if ("erreur" in destinataire) return { erreur: destinataire.erreur };

  const resultat = await envoyerQuestionnaireQualite(destinataire, utilisateur.id);
  if (resultat.erreur) return { erreur: resultat.erreur };

  await journaliser({
    action: "questionnaire.sent",
    summary: `Questionnaire « ${LIBELLE_TYPE_QUESTIONNAIRE[destinataire.type]} » envoyé`,
    entityType: "Questionnaire",
    userId: utilisateur.id,
    metadata: { ...destinataire },
  });

  revalidatePath("/questionnaires");
  return { succes: resultat.succes };
}
