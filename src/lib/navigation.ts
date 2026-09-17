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
      { libelle: "Statistiques", phase: 16 },
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
      { libelle: "Qualiopi", phase: 15 },
      { libelle: "Indicateurs", phase: 15 },
      { libelle: "Audits", phase: 15 },
      { libelle: "Plan d'actions", phase: 15 },
    ],
  },
  {
    titre: "Paramètres",
    icone: "engrenage",
    entrees: [
      { libelle: "Organisme", chemin: "/parametres/organisme" },
      { libelle: "Mon compte", chemin: "/mon-compte" },
      { libelle: "Utilisateurs", phase: 17, roles: ADMIN_SEUL },
      { libelle: "Rôles et permissions", phase: 17, roles: ADMIN_SEUL },
      { libelle: "Modèles d'emails", chemin: "/parametres/modeles-emails" },
      { libelle: "Automatisations", chemin: "/parametres/automatisations" },
      { libelle: "Intégrations", phase: 17, roles: ADMIN_SEUL },
      { libelle: "API", phase: 17, roles: ADMIN_SEUL },
      { libelle: "Paramètres généraux", phase: 17, roles: ADMIN_SEUL },
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
