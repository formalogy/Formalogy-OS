import type { TypeQuestionnaire } from "@prisma/client";

type Commun = {
  code: string;
  libelle: string;
  /// Intertitre affiché avant cette question. Une question qui en porte un
  /// ouvre une partie ; les suivantes s'y rattachent jusqu'au prochain.
  section?: string;
};

export type QuestionQuestionnaire =
  | (Commun & { type: "CASE" })
  | (Commun & { type: "COMMENTAIRE"; obligatoire?: boolean });

/// Questions par type de questionnaire, fixes pour que les réponses restent
/// comparables d'un envoi à l'autre (même logique que le questionnaire de
/// satisfaction apprenant et que les indicateurs Qualiopi) : cases à cocher
/// et commentaires libres, pas de champ noté.
export const QUESTIONS_QUESTIONNAIRE: Record<TypeQuestionnaire, QuestionQuestionnaire[]> = {
  // Questionnaire pré-formation : deux parties dans un seul envoi, le
  // positionnement (où en est l'apprenant) puis les attentes (ce qu'il vient
  // chercher). C'est la preuve de l'analyse du besoin attendue par Qualiopi.
  POSITIONNEMENT: [
    { code: "deja_suivi", type: "CASE", libelle: "J'ai déjà suivi une formation sur ce sujet", section: "Où en êtes-vous aujourd'hui ?" },
    { code: "prerequis", type: "CASE", libelle: "Je maîtrise les prérequis indiqués pour cette formation" },
    { code: "niveau", type: "COMMENTAIRE", libelle: "Décrivez brièvement votre pratique actuelle sur ce sujet." },
    {
      code: "attentes",
      type: "COMMENTAIRE",
      libelle: "Qu'attendez-vous de cette formation ?",
      obligatoire: true,
      section: "Vos attentes",
    },
    { code: "objectif_professionnel", type: "COMMENTAIRE", libelle: "À quoi doit-elle vous servir concrètement dans votre travail ?" },
    { code: "situations", type: "COMMENTAIRE", libelle: "Y a-t-il des situations ou des difficultés précises que vous aimeriez voir traitées ?" },
    { code: "besoins", type: "COMMENTAIRE", libelle: "Avez-vous des besoins particuliers à signaler (matériel, rythme, accessibilité) ?" },
  ],
  CHAUD_FORMATEUR: [
    { code: "objectifs_atteints", type: "CASE", libelle: "Le groupe a atteint les objectifs pédagogiques" },
    { code: "conditions_materielles", type: "CASE", libelle: "Les conditions matérielles étaient satisfaisantes" },
    { code: "referait", type: "CASE", libelle: "Je referais cette formation dans les mêmes conditions" },
    { code: "points_forts", type: "COMMENTAIRE", libelle: "Points forts du déroulement de la session" },
    { code: "difficultes", type: "COMMENTAIRE", libelle: "Difficultés rencontrées ou points à améliorer" },
  ],
  FROID: [
    { code: "utilise", type: "CASE", libelle: "J'utilise dans mon activité professionnelle ce que j'ai appris en formation" },
    { code: "impact_positif", type: "CASE", libelle: "Cette formation a eu un impact positif sur mon travail" },
    { code: "mise_en_pratique", type: "COMMENTAIRE", libelle: "Concrètement, qu'avez-vous mis en pratique depuis la formation ?" },
    { code: "commentaire", type: "COMMENTAIRE", libelle: "Un commentaire à ajouter ?" },
  ],
  FINANCEUR: [
    { code: "dossiers_conformes", type: "CASE", libelle: "Les dossiers déposés étaient complets et conformes" },
    { code: "delais_satisfaisants", type: "CASE", libelle: "Les délais de réponse de l'organisme étaient satisfaisants" },
    { code: "remarques", type: "COMMENTAIRE", libelle: "Remarques ou suggestions" },
  ],
  SATISFACTION_FORMATEUR: [
    { code: "satisfait_collaboration", type: "CASE", libelle: "Je suis satisfait(e) de ma collaboration avec l'organisme" },
    { code: "communication_claire", type: "CASE", libelle: "La communication (plannings, documents, consignes) était claire" },
    { code: "recommanderait", type: "CASE", libelle: "Je recommanderais de collaborer avec cet organisme" },
    { code: "points_forts", type: "COMMENTAIRE", libelle: "Ce qui fonctionne bien" },
    { code: "ameliorations", type: "COMMENTAIRE", libelle: "Ce qui pourrait être amélioré" },
  ],
};

export const LIBELLE_TYPE_QUESTIONNAIRE: Record<TypeQuestionnaire, string> = {
  POSITIONNEMENT: "Attentes et positionnement (avant la formation)",
  CHAUD_FORMATEUR: "À chaud — formateur",
  FROID: "À froid — apprenant (60 jours après)",
  FINANCEUR: "Financeur (campagne annuelle)",
  SATISFACTION_FORMATEUR: "Satisfaction formateur (campagne annuelle)",
};

/// Un questionnaire est « lié à une session » si son destinataire dépend
/// d'une session précise (apprenant ou formateur d'une formation donnée),
/// par opposition aux campagnes annuelles (financeur, satisfaction formateur).
export const TYPES_LIES_A_UNE_SESSION: TypeQuestionnaire[] = ["POSITIONNEMENT", "CHAUD_FORMATEUR", "FROID"];

export type ReponsesQuestionnaire = Record<string, boolean | string | undefined>;
