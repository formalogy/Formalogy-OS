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

const TOUS: Role[] = ["ADMIN", "GESTIONNAIRE", "FORMATEUR"];
const ADMIN_SEUL: Role[] = ["ADMIN"];

// Les chemins déclarés ici existent réellement. Ajouter un chemin sans créer
// la page correspondante produirait un lien mort.
export const MENU: GroupeMenu[] = [
  {
    titre: "Pilotage",
    icone: "jauge",
    entrees: [
      { libelle: "Tableau de bord", chemin: "/tableau-de-bord", roles: TOUS },
      { libelle: "Activité", chemin: "/activite" },
      { libelle: "Statistiques", phase: 16 },
    ],
  },
  {
    titre: "Gestion",
    icone: "personnes",
    entrees: [
      { libelle: "Apprenants", phase: 5 },
      { libelle: "Entreprises", phase: 4 },
      { libelle: "CRM", phase: 4 },
      { libelle: "Formateurs", phase: 10 },
    ],
  },
  {
    titre: "Pédagogie",
    icone: "livre",
    entrees: [
      { libelle: "Formations", phase: 6 },
      { libelle: "Sessions", phase: 7, roles: TOUS },
      { libelle: "Planning", phase: 7, roles: TOUS },
    ],
  },
  {
    titre: "Administratif",
    icone: "document",
    entrees: [
      { libelle: "Documents", phase: 8, roles: TOUS },
      { libelle: "Signatures", phase: 11 },
      { libelle: "Émargements", phase: 11, roles: TOUS },
      { libelle: "Certificats", phase: 12 },
    ],
  },
  {
    titre: "Finances",
    icone: "euro",
    entrees: [
      { libelle: "Factures", phase: 13 },
      { libelle: "Paiements", phase: 13 },
      { libelle: "OPCO", phase: 14 },
      { libelle: "France Travail", phase: 14 },
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
      { libelle: "Utilisateurs", phase: 17, roles: ADMIN_SEUL },
      { libelle: "Rôles et permissions", phase: 17, roles: ADMIN_SEUL },
      { libelle: "Modèles d'emails", phase: 9 },
      { libelle: "Modèles de documents", phase: 8 },
      { libelle: "Automatisations", phase: 9 },
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
