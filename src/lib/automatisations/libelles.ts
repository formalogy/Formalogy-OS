import type {
  DeclencheurAutomatisation,
  PrioriteTache,
  StatutEmail,
  StatutExecution,
} from "@prisma/client";

export const LIBELLE_DECLENCHEUR: Record<DeclencheurAutomatisation, string> = {
  APPRENANT_CREE: "Quand un apprenant est créé",
  INSCRIPTION_SESSION: "Quand un apprenant est inscrit à une session",
  SESSION_AVANT_DEBUT: "Quelques jours avant le début d'une session (0 = le jour même)",
  SESSION_AVANT_FIN: "Quelques jours avant la fin d'une session (0 = le dernier jour)",
  SESSION_APRES_FIN: "Quelques jours après la fin d'une session",
  SESSION_TERMINEE: "Quand une session passe à « Terminée » ou « Clôturée »",
  RELANCE_PROSPECT_DUE: "Quand la date de relance d'un prospect est atteinte",
};

/// Déclencheurs traités par le réveil quotidien plutôt qu'au moment d'une action.
export const DECLENCHEURS_PLANIFIES: DeclencheurAutomatisation[] = [
  "SESSION_AVANT_DEBUT",
  "SESSION_AVANT_FIN",
  "SESSION_APRES_FIN",
  "RELANCE_PROSPECT_DUE",
];

export const LIBELLE_STATUT_EMAIL: Record<StatutEmail, string> = {
  SIMULE: "Simulé",
  ENVOYE: "Envoyé",
  DELIVRE: "Délivré",
  OUVERT: "Ouvert",
  ECHEC: "Échec",
};

export const TON_STATUT_EMAIL: Record<StatutEmail, string> = {
  SIMULE: "bg-surface-creuse text-texte-doux",
  ENVOYE: "bg-accent-pale text-accent-fort",
  DELIVRE: "bg-succes/12 text-succes",
  OUVERT: "bg-succes/12 text-succes",
  ECHEC: "bg-danger-pale text-danger",
};

export const LIBELLE_STATUT_EXECUTION: Record<StatutExecution, string> = {
  REUSSIE: "Réussie",
  IGNOREE: "Rien à faire",
  ECHEC: "Échec",
};

export const TON_STATUT_EXECUTION: Record<StatutExecution, string> = {
  REUSSIE: "text-succes",
  IGNOREE: "text-texte-tenu",
  ECHEC: "text-danger",
};

export const LIBELLE_PRIORITE: Record<PrioriteTache, string> = {
  BASSE: "Basse",
  NORMALE: "Normale",
  HAUTE: "Haute",
};

export const TON_PRIORITE: Record<PrioriteTache, string> = {
  BASSE: "bg-surface-creuse text-texte-tenu",
  NORMALE: "bg-accent-pale text-accent-fort",
  HAUTE: "bg-danger-pale text-danger",
};

/// Décrit une action en français, pour l'écran des automatisations.
export function decrireAction(action: unknown): string {
  const a = action as {
    type?: string; modele?: string; destinataires?: string; titre?: string; delaiJours?: number; joindre?: string[];
  };
  if (a.type === "EMAIL") {
    const qui = a.destinataires === "APPRENANTS_SESSION" ? "à tous les inscrits de la session" : "à l'apprenant";
    const jointes = a.joindre?.includes("CONVENTION")
      ? ", avec sa convention de formation générée depuis le modèle déposé"
      : "";
    return `Envoyer le modèle « ${a.modele} » ${qui}${jointes}`;
  }
  if (a.type === "TACHE") {
    const quand = a.delaiJours ? `à échéance de ${a.delaiJours} jour${a.delaiJours > 1 ? "s" : ""}` : "pour le jour même";
    return `Créer la tâche « ${a.titre} » ${quand}`;
  }
  if (a.type === "FACTURE_HENRRI") {
    return "Émettre automatiquement la facture dans Henrri (entreprise cliente, ou apprenant unique à défaut) et en récupérer le PDF";
  }
  if (a.type === "DOCUMENTS_FIN_FORMATION") {
    return "Générer l'attestation et le certificat de réalisation des apprenants prêts (mêmes règles que le bouton manuel)";
  }
  return "Action inconnue";
}
