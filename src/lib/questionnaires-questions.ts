import type { ResultatAcquis, TypeQuestionnaire } from "@prisma/client";

/// Questionnaires modifiables depuis l'application : les cinq types qualité,
/// plus le questionnaire de satisfaction à chaud des apprenants (« SATISFACTION »),
/// qui a sa propre table mais le même contenu modifiable.
export type CodeQuestionnaire = TypeQuestionnaire | "SATISFACTION";

/// Dans l'ordre où ils interviennent autour d'une formation.
export const CODES_QUESTIONNAIRE: CodeQuestionnaire[] = [
  "POSITIONNEMENT",
  "SATISFACTION",
  "CHAUD_FORMATEUR",
  "FROID",
  "SATISFACTION_FORMATEUR",
  "FINANCEUR",
];

export function estCodeQuestionnaire(valeur: unknown): valeur is CodeQuestionnaire {
  return CODES_QUESTIONNAIRE.includes(valeur as CodeQuestionnaire);
}

/// Toutes les questions se répondent en cochant des cases, sauf la réponse
/// libre. Une note va de 1 (« Pas du tout ») à 5 (« Tout à fait ») : c'est la
/// seule forme chiffrée, celle qui alimente les statistiques.
export type TypeQuestion = "CHOIX_UNIQUE" | "CHOIX_MULTIPLE" | "NOTE" | "TEXTE";

export const TYPES_QUESTION: TypeQuestion[] = ["CHOIX_UNIQUE", "CHOIX_MULTIPLE", "NOTE", "TEXTE"];

export type Question = {
  /// Identifiant stable : il survit aux reformulations, ce qui garde les
  /// réponses comparables d'un envoi à l'autre (statistiques, Qualiopi).
  id: string;
  type: TypeQuestion;
  libelle: string;
  /// Cases proposées, pour les questions à choix.
  options?: string[];
  obligatoire?: boolean;
  /// Intertitre affiché avant cette question : il ouvre une nouvelle partie.
  section?: string;
  /// Satisfaction à chaud : la note qui sert de satisfaction générale.
  globale?: boolean;
};

export type ContenuQuestionnaire = { titre: string; introduction?: string; questions: Question[] };

/// Réponses par identifiant de question : texte de la case cochée, liste des
/// cases cochées, note de 1 à 5 ou texte libre.
export type ReponsesQuestionnaire = Record<string, string | string[] | number>;

/// État renvoyé au formulaire public. En cas d'erreur, les valeurs saisies
/// reviennent pour être réaffichées : rien n'est perdu.
export type EtatReponse = {
  erreur?: string;
  merci?: boolean;
  valeurs?: Record<string, string | string[]>;
  essai?: number;
};

export const LIBELLES_NOTE = ["Pas du tout", "Peu", "Moyen", "Plutôt", "Tout à fait"];

export const LIBELLE_TYPE_QUESTION: Record<TypeQuestion, string> = {
  CHOIX_UNIQUE: "Cases — une seule réponse",
  CHOIX_MULTIPLE: "Cases — plusieurs réponses possibles",
  NOTE: "Note de 1 à 5 (de « Pas du tout » à « Tout à fait »)",
  TEXTE: "Réponse libre (texte)",
};

export const LIBELLE_TYPE_QUESTIONNAIRE: Record<TypeQuestionnaire, string> = {
  POSITIONNEMENT: "Attentes et positionnement (avant la formation)",
  CHAUD_FORMATEUR: "À chaud — formateur",
  FROID: "À froid — apprenant (60 jours après)",
  FINANCEUR: "Financeur (campagne annuelle)",
  SATISFACTION_FORMATEUR: "Satisfaction formateur (campagne annuelle)",
};

export const LIBELLE_QUESTIONNAIRE: Record<CodeQuestionnaire, string> = {
  ...LIBELLE_TYPE_QUESTIONNAIRE,
  SATISFACTION: "À chaud — apprenant (satisfaction en fin de formation)",
};

/// Un questionnaire est « lié à une session » si son destinataire dépend
/// d'une session précise (apprenant ou formateur d'une formation donnée),
/// par opposition aux campagnes annuelles (financeur, satisfaction formateur).
export const TYPES_LIES_A_UNE_SESSION: TypeQuestionnaire[] = ["POSITIONNEMENT", "CHAUD_FORMATEUR", "FROID"];

const OUI_NON = ["Oui", "Non"];

/// Questionnaires d'origine. Ils s'appliquent tant que personne ne les a
/// modifiés depuis l'application, et servent de point de retour.
export const QUESTIONNAIRES_ORIGINE: Record<CodeQuestionnaire, ContenuQuestionnaire> = {
  // Deux parties dans un seul envoi : le positionnement (où en est
  // l'apprenant) puis les attentes (ce qu'il vient chercher). C'est la preuve
  // de l'analyse du besoin attendue par Qualiopi, handicap compris.
  POSITIONNEMENT: {
    titre: "Vos attentes et votre positionnement",
    introduction: "Ce questionnaire nous aide à adapter la formation à votre situation. Cochez les cases qui vous correspondent : quelques minutes suffisent.",
    questions: [
      { id: "deja_suivi", type: "CHOIX_UNIQUE", libelle: "Avez-vous déjà suivi une formation sur ce sujet ?", options: OUI_NON, obligatoire: true, section: "Où en êtes-vous aujourd'hui ?" },
      { id: "niveau_estime", type: "CHOIX_UNIQUE", libelle: "Comment évaluez-vous votre niveau actuel sur ce sujet ?", options: ["Débutant", "Notions de base", "Intermédiaire", "Avancé"], obligatoire: true },
      { id: "prerequis", type: "CHOIX_UNIQUE", libelle: "Maîtrisez-vous les prérequis indiqués pour cette formation ?", options: ["Oui", "En partie", "Non", "Je ne sais pas"], obligatoire: true },
      { id: "niveau", type: "TEXTE", libelle: "Décrivez brièvement votre pratique actuelle sur ce sujet." },
      { id: "attentes", type: "TEXTE", libelle: "Qu'attendez-vous de cette formation ?", obligatoire: true, section: "Vos attentes" },
      { id: "objectif_professionnel", type: "TEXTE", libelle: "À quoi doit-elle vous servir concrètement dans votre travail ?" },
      { id: "situations", type: "TEXTE", libelle: "Y a-t-il des situations ou des difficultés précises que vous aimeriez voir traitées ?" },
      {
        id: "besoins_particuliers",
        type: "CHOIX_UNIQUE",
        libelle: "Avez-vous des besoins particuliers pour suivre la formation (matériel, rythme, accessibilité, situation de handicap) ?",
        options: ["Non", "Oui"],
        obligatoire: true,
        section: "Vos besoins particuliers",
      },
      { id: "besoins", type: "TEXTE", libelle: "Si oui, précisez-les." },
    ],
  },
  SATISFACTION: {
    titre: "Votre avis sur la formation",
    introduction: "Cochez une case par ligne, de « Pas du tout » à « Tout à fait ».",
    questions: [
      { id: "objectifs", type: "NOTE", libelle: "Les objectifs de la formation ont-ils été atteints ?", obligatoire: true },
      { id: "contenu", type: "NOTE", libelle: "Le contenu correspondait-il à vos attentes ?", obligatoire: true },
      { id: "animation", type: "NOTE", libelle: "L'animation du formateur vous a-t-elle convenu ?", obligatoire: true },
      { id: "organisation", type: "NOTE", libelle: "L'organisation et les conditions (salle, outils, visio) étaient-elles satisfaisantes ?", obligatoire: true },
      { id: "recommandation", type: "NOTE", libelle: "Recommanderiez-vous cette formation ?", obligatoire: true },
      { id: "globale", type: "NOTE", libelle: "Globalement, êtes-vous satisfait(e) de cette formation ?", obligatoire: true, globale: true },
      { id: "pointsForts", type: "TEXTE", libelle: "Ce que vous avez le plus apprécié", section: "Vos commentaires" },
      { id: "ameliorations", type: "TEXTE", libelle: "Ce qui pourrait être amélioré" },
    ],
  },
  CHAUD_FORMATEUR: {
    titre: "Bilan de la session",
    introduction: "Votre retour sur la session que vous venez d'animer.",
    questions: [
      { id: "objectifs_atteints", type: "NOTE", libelle: "Le groupe a-t-il atteint les objectifs pédagogiques ?", obligatoire: true },
      { id: "conditions_materielles", type: "NOTE", libelle: "Les conditions matérielles étaient-elles satisfaisantes ?", obligatoire: true },
      { id: "niveau_groupe", type: "CHOIX_UNIQUE", libelle: "Le niveau des participants correspondait-il aux prérequis ?", options: ["Oui, pour tous", "Pour la plupart", "Non"], obligatoire: true },
      { id: "referait", type: "CHOIX_UNIQUE", libelle: "Referiez-vous cette formation dans les mêmes conditions ?", options: ["Oui", "Oui, avec des ajustements", "Non"], obligatoire: true },
      { id: "points_forts", type: "TEXTE", libelle: "Points forts du déroulement de la session" },
      { id: "difficultes", type: "TEXTE", libelle: "Difficultés rencontrées ou points à améliorer" },
    ],
  },
  FROID: {
    titre: "Que retenez-vous de la formation ?",
    introduction: "Quelques semaines ont passé : dites-nous ce que la formation vous a apporté.",
    questions: [
      { id: "utilise", type: "CHOIX_UNIQUE", libelle: "Utilisez-vous dans votre activité ce que vous avez appris ?", options: ["Oui, régulièrement", "Oui, de temps en temps", "Pas encore", "Non"], obligatoire: true },
      { id: "impact_positif", type: "NOTE", libelle: "La formation a-t-elle eu un impact positif sur votre travail ?", obligatoire: true },
      {
        id: "apports",
        type: "CHOIX_MULTIPLE",
        libelle: "Qu'est-ce que la formation vous a apporté ?",
        options: ["Des compétences nouvelles", "Plus d'efficacité", "Plus de confiance", "Une évolution de poste ou de missions", "Rien de particulier"],
      },
      { id: "mise_en_pratique", type: "TEXTE", libelle: "Concrètement, qu'avez-vous mis en pratique depuis la formation ?" },
      { id: "commentaire", type: "TEXTE", libelle: "Un commentaire à ajouter ?" },
    ],
  },
  SATISFACTION_FORMATEUR: {
    titre: "Bilan annuel de notre collaboration",
    introduction: "Votre regard sur l'année écoulée nous aide à améliorer l'organisation des formations.",
    questions: [
      { id: "satisfait_collaboration", type: "NOTE", libelle: "Êtes-vous satisfait(e) de votre collaboration avec l'organisme ?", obligatoire: true },
      { id: "communication_claire", type: "NOTE", libelle: "La communication (plannings, documents, consignes) était-elle claire ?", obligatoire: true },
      { id: "recommanderait", type: "CHOIX_UNIQUE", libelle: "Recommanderiez-vous de collaborer avec notre organisme ?", options: OUI_NON, obligatoire: true },
      { id: "points_forts", type: "TEXTE", libelle: "Ce qui fonctionne bien" },
      { id: "ameliorations", type: "TEXTE", libelle: "Ce qui pourrait être amélioré" },
    ],
  },
  FINANCEUR: {
    titre: "Votre avis sur notre collaboration",
    introduction: "Merci de prendre quelques minutes pour évaluer nos échanges de l'année écoulée.",
    questions: [
      { id: "dossiers_conformes", type: "NOTE", libelle: "Les dossiers déposés étaient-ils complets et conformes ?", obligatoire: true },
      { id: "delais_satisfaisants", type: "NOTE", libelle: "Nos délais de réponse étaient-ils satisfaisants ?", obligatoire: true },
      { id: "remarques", type: "TEXTE", libelle: "Remarques ou suggestions" },
    ],
  },
};

/// Évaluation des acquis demandée au formateur dans son bilan de fin de
/// session : une ligne par apprenant inscrit. Elle figure sur l'attestation
/// de fin de formation ; les documents de fin partent dès sa réception.
export type EvaluationDemandee = {
  apprenants: { id: string; nom: string }[];
  existantes: Record<string, { resultat: ResultatAcquis; commentaire: string | null }>;
};

export const RESULTATS_ACQUIS: ResultatAcquis[] = ["ACQUIS", "PARTIELLEMENT_ACQUIS", "NON_ACQUIS"];

export const LIBELLE_ACQUIS: Record<ResultatAcquis, string> = {
  ACQUIS: "Acquis",
  PARTIELLEMENT_ACQUIS: "Partiellement acquis",
  NON_ACQUIS: "Non acquis",
};

/// Réponse lisible par un humain, pour les fiches et les tableaux.
export function texteReponse(question: Question, valeur: unknown): string | null {
  if (valeur === undefined || valeur === null || valeur === "") return null;
  if (question.type === "NOTE" && typeof valeur === "number") return `${valeur} / 5 — ${LIBELLES_NOTE[valeur - 1] ?? ""}`;
  if (Array.isArray(valeur)) return valeur.length > 0 ? valeur.join(", ") : null;
  return String(valeur);
}
