/// Questionnaire de satisfaction « à chaud ». Les questions sont fixes pour
/// que les réponses restent comparables d'une session à l'autre (indicateurs
/// Qualiopi). Chaque question se note de 1 (pas du tout) à 5 (tout à fait).
export const QUESTIONS_SATISFACTION = [
  { cle: "objectifs", libelle: "Les objectifs de la formation ont-ils été atteints ?" },
  { cle: "contenu", libelle: "Le contenu correspondait-il à vos attentes ?" },
  { cle: "animation", libelle: "Comment évaluez-vous l'animation du formateur ?" },
  { cle: "organisation", libelle: "L'organisation et les conditions (salle, outils, visio) étaient-elles satisfaisantes ?" },
  { cle: "recommandation", libelle: "Recommanderiez-vous cette formation ?" },
] as const;

export type CleQuestion = (typeof QUESTIONS_SATISFACTION)[number]["cle"];

export type ReponsesSatisfaction = {
  notes: Record<CleQuestion, number>;
  pointsForts?: string;
  ameliorations?: string;
};

export const LIBELLES_NOTE = ["Pas du tout", "Peu", "Moyen", "Plutôt", "Tout à fait"];
