import type { Role } from "@/lib/session";

export type EntreeMenu = {
  libelle: string;
  /// Chemin de la page. Absent tant que le module n'est pas construit :
  /// l'entrée apparaît alors grisée plutôt que de mener à une page vide.
  chemin?: string;
  /// Clé d'icône (voir ICONES dans barre-laterale.tsx).
  icone: string;
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
      { libelle: "Mes sessions", chemin: "/mes-sessions", icone: "calendrier", roles: FORMATEUR_SEUL },
      { libelle: "Mon compte", chemin: "/mon-compte", icone: "utilisateur", roles: FORMATEUR_SEUL },
    ],
  },
  {
    titre: "Pilotage",
    icone: "jauge",
    entrees: [
      { libelle: "Tableau de bord", chemin: "/tableau-de-bord", icone: "accueil" },
      { libelle: "Activité", chemin: "/activite", icone: "activite" },
      { libelle: "Statistiques", chemin: "/statistiques", icone: "statistiques" },
    ],
  },
  {
    titre: "Gestion",
    icone: "personnes",
    entrees: [
      { libelle: "Apprenants", chemin: "/apprenants", icone: "personnes" },
      { libelle: "Entreprises", chemin: "/entreprises", icone: "entreprise" },
      { libelle: "CRM", chemin: "/crm", icone: "carnet" },
      { libelle: "Formateurs", chemin: "/formateurs", icone: "tableau" },
    ],
  },
  {
    titre: "Pédagogie",
    icone: "livre",
    entrees: [
      { libelle: "Formations", chemin: "/formations", icone: "livre" },
      { libelle: "Sessions", chemin: "/sessions", icone: "calendrier" },
      { libelle: "Planning", chemin: "/planning", icone: "planning" },
    ],
  },
  {
    titre: "Administratif",
    icone: "document",
    entrees: [
      { libelle: "Documents", chemin: "/documents", icone: "document" },
      { libelle: "Signatures", chemin: "/signatures", icone: "signature" },
      { libelle: "Émargements", chemin: "/emargements", icone: "emargement" },
      { libelle: "Attestations", chemin: "/attestations", icone: "certificat" },
    ],
  },
  {
    titre: "Finances",
    icone: "euro",
    entrees: [
      { libelle: "Factures", chemin: "/factures", icone: "facture" },
      { libelle: "Paiements", chemin: "/paiements", icone: "carte" },
      { libelle: "Prises en charge", chemin: "/financements", icone: "portefeuille" },
    ],
  },
  {
    titre: "Qualité",
    icone: "etoile",
    entrees: [
      { libelle: "Qualiopi", chemin: "/qualiopi", icone: "etoile" },
      { libelle: "Questionnaires", chemin: "/questionnaires", icone: "sondage" },
      { libelle: "Plan d'actions", chemin: "/qualiopi/actions", icone: "liste" },
    ],
  },
  {
    titre: "Paramètres",
    icone: "engrenage",
    entrees: [
      { libelle: "Organisme", chemin: "/parametres/organisme", icone: "immeuble" },
      { libelle: "Mon compte", chemin: "/mon-compte", icone: "utilisateur" },
      { libelle: "Utilisateurs", chemin: "/parametres/utilisateurs", icone: "personnes", roles: ADMIN_SEUL },
      { libelle: "Rôles et permissions", chemin: "/parametres/roles", icone: "bouclier", roles: ADMIN_SEUL },
      { libelle: "Modèles d'emails", chemin: "/parametres/modeles-emails", icone: "enveloppe" },
      { libelle: "Automatisations", chemin: "/parametres/automatisations", icone: "robot" },
      { libelle: "Intégrations", chemin: "/parametres/integrations", icone: "prise", roles: ADMIN_SEUL },
      { libelle: "API", chemin: "/parametres/api", icone: "code", roles: ADMIN_SEUL },
      { libelle: "Paramètres généraux", chemin: "/parametres/general", icone: "engrenage", roles: ADMIN_SEUL },
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
