import type { Role } from "@/lib/session";

export type EntreeMenu = {
  libelle: string;
  /// Chemin de la page. Absent tant que le module n'est pas construit :
  /// l'entrée apparaît alors grisée plutôt que de mener à une page vide.
  chemin?: string;
  /// Phase du plan de développement qui construira ce module.
  phase?: number;
  /// Rôles ayant accès. Par défaut : ADMIN et GESTIONNAIRE.
  roles?: Role[];
};

export type GroupeMenu = {
  titre: string;
  icone: string;
  entrees: EntreeMenu[];
};

const ADMIN_SEUL: Role[] = ["ADMIN"];
const FORMATEUR_SEUL: Role[] = ["FORMATEUR"];

// Les chemins déclarés ici existent réellement. Ajouter un chemin sans créer
// la page correspondante produirait un lien mort.
export const MENU: GroupeMenu[] = [
  {
    // Espace des formateurs : leurs seules sessions, en lecture.
    titre: "Mon espace",
    icone: "livre",
    entrees: [
      { libelle: "Mes sessions", chemin: "/mes-sessions", roles: FORMATEUR_SEUL },
      { libelle: "Mon compte", chemin: "/mon-compte", roles: FORMATEUR_SEUL },
    ],
  },
  {
    titre: "Pilotage",
    icone: "jauge",
    entrees: [
      { libelle: "Tableau de bord", chemin: "/tableau-de-bord" },
      { libelle: "Activité", chemin: "/activite" },
      // Chiffre d'affaires, taux de remplissage, assiduité, satisfaction,
      // résultats des évaluations. Reportée le 19/09/2026 (la Phase 16
      // initialement prévue pour ce module a servi à la facturation
      // automatique Henrri, demandée entre-temps) ; à replanifier avec le client.
      { libelle: "Statistiques", phase: 18 },
    ],
  },
  {
    titre: "Gestion",
    icone: "personnes",
    entrees: [
      { libelle: "Apprenants", chemin: "/apprenants" },
      { libelle: "Entreprises", chemin: "/entreprises" },
      { libelle: "CRM", chemin: "/crm" },
      { libelle: "Formateurs", chemin: "/formateurs" },
    ],
  },
  {
    titre: "Pédagogie",
    icone: "livre",
    entrees: [
      { libelle: "Formations", chemin: "/formations" },
      { libelle: "Sessions", chemin: "/sessions" },
      { libelle: "Planning", chemin: "/planning" },
    ],
  },
  {
    titre: "Administratif",
    icone: "document",
    entrees: [
      { libelle: "Documents", chemin: "/documents" },
      { libelle: "Signatures", chemin: "/signatures" },
      { libelle: "Émargements", chemin: "/emargements" },
      { libelle: "Attestations", chemin: "/attestations" },
    ],
  },
  {
    titre: "Finances",
    icone: "euro",
    entrees: [
      { libelle: "Factures", chemin: "/factures" },
      { libelle: "Paiements", chemin: "/paiements" },
      { libelle: "Prises en charge", chemin: "/financements" },
    ],
  },
  {
    titre: "Qualité",
    icone: "etoile",
    entrees: [
      { libelle: "Qualiopi", chemin: "/qualiopi" },
      { libelle: "Plan d'actions", chemin: "/qualiopi/actions" },
    ],
  },
  {
    titre: "Paramètres",
    icone: "engrenage",
    entrees: [
      { libelle: "Organisme", chemin: "/parametres/organisme" },
      { libelle: "Mon compte", chemin: "/mon-compte" },
      { libelle: "Utilisateurs", chemin: "/parametres/utilisateurs", roles: ADMIN_SEUL },
      { libelle: "Rôles et permissions", chemin: "/parametres/roles", roles: ADMIN_SEUL },
      { libelle: "Modèles d'emails", chemin: "/parametres/modeles-emails" },
      { libelle: "Automatisations", chemin: "/parametres/automatisations" },
      { libelle: "Intégrations", chemin: "/parametres/integrations", roles: ADMIN_SEUL },
      { libelle: "API", chemin: "/parametres/api", roles: ADMIN_SEUL },
      { libelle: "Paramètres généraux", chemin: "/parametres/general", roles: ADMIN_SEUL },
    ],
  },
];

const ROLES_PAR_DEFAUT: Role[] = ["ADMIN", "GESTIONNAIRE"];

/// Le menu affiché dépend du rôle. Ce filtrage est un confort d'affichage :
/// la véritable protection est faite par chaque page, côté serveur.
export function menuPourRole(role: Role): GroupeMenu[] {
  return MENU.map((groupe) => ({
    ...groupe,
    entrees: groupe.entrees.filter((entree) =>
      (entree.roles ?? ROLES_PAR_DEFAUT).includes(role),
    ),
  })).filter((groupe) => groupe.entrees.length > 0);
}
