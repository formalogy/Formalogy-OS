import type { OrigineActionQualite, StatutActionQualite } from "@prisma/client";

/// Version du référentiel suivie par l'application.
export const VERSION_REFERENTIEL = {
  nom: "V10",
  texte: "décret n° 2026-728 du 1er août 2026",
  applicableAux: "audits réalisés à partir du 1er novembre 2026",
  entreeEnVigueur: new Date(Date.UTC(2026, 10, 1)),
};

/// Intitulés officiels des sept critères (annexe au chapitre VI du titre Ier
/// du livre III de la sixième partie du code du travail).
export const CRITERES: { numero: number; intitule: string; court: string }[] = [
  {
    numero: 1,
    court: "Information du public",
    intitule: "Les conditions d'information du public sur les prestations proposées, les délais pour y accéder et les résultats obtenus.",
  },
  {
    numero: 2,
    court: "Objectifs et conception",
    intitule:
      "L'identification précise des objectifs des prestations proposées et l'adaptation de ces prestations aux publics bénéficiaires, lors de la conception des prestations.",
  },
  {
    numero: 3,
    court: "Accueil, suivi et évaluation",
    intitule:
      "L'adaptation aux publics bénéficiaires des prestations et des modalités d'accueil, d'accompagnement, de suivi et d'évaluation mises en œuvre.",
  },
  {
    numero: 4,
    court: "Moyens et encadrement",
    intitule: "L'adéquation des moyens pédagogiques, techniques et d'encadrement aux prestations mises en œuvre.",
  },
  {
    numero: 5,
    court: "Compétences des intervenants",
    intitule:
      "La qualification et le développement des connaissances et compétences des personnels chargés de mettre en œuvre les prestations.",
  },
  {
    numero: 6,
    court: "Environnement professionnel",
    intitule: "L'inscription et l'investissement du prestataire dans son environnement professionnel.",
  },
  {
    numero: 7,
    court: "Appréciations et amélioration",
    intitule:
      "Le recueil et la prise en compte des appréciations et des réclamations formulées par les parties prenantes aux prestations délivrées.",
  },
];

export const LIBELLE_ORIGINE_ACTION: Record<OrigineActionQualite, string> = {
  AUDIT: "Écart d'audit",
  INTERNE: "Constat interne",
  RECLAMATION: "Réclamation",
};

export const ORIGINES_ACTION: OrigineActionQualite[] = ["AUDIT", "INTERNE", "RECLAMATION"];

export const LIBELLE_STATUT_ACTION: Record<StatutActionQualite, string> = {
  A_FAIRE: "À faire",
  EN_COURS: "En cours",
  FAITE: "Faite",
};

export const TON_STATUT_ACTION: Record<StatutActionQualite, string> = {
  A_FAIRE: "bg-alerte/12 text-alerte",
  EN_COURS: "bg-accent-pale text-accent-fort",
  FAITE: "bg-succes/12 text-succes",
};

export const STATUTS_ACTION: StatutActionQualite[] = ["A_FAIRE", "EN_COURS", "FAITE"];

/// Avancement d'un ensemble d'indicateurs : seuls les indicateurs déclarés
/// applicables comptent.
export function avancement(indicateurs: { applicable: boolean; statut: string }[]) {
  const applicables = indicateurs.filter((i) => i.applicable);
  const conformes = applicables.filter((i) => i.statut === "CONFORME").length;
  return {
    applicables: applicables.length,
    conformes,
    pourcentage: applicables.length === 0 ? 0 : Math.round((conformes / applicables.length) * 100),
  };
}
