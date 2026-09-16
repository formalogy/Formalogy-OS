import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

export type Role = "ADMIN" | "GESTIONNAIRE" | "FORMATEUR";

export type UtilisateurConnecte = {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
};

/// Lit la session côté serveur. Retourne null si personne n'est connecté.
export async function lireUtilisateur(): Promise<UtilisateurConnecte | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const utilisateur = session.user as unknown as UtilisateurConnecte;

  // Un compte désactivé conserve ses sessions en base : on refuse l'accès
  // immédiatement plutôt que d'attendre leur expiration.
  if (!utilisateur.isActive) return null;

  return utilisateur;
}

/// Exige un utilisateur connecté. Renvoie vers l'écran de connexion sinon.
/// À appeler dans chaque page protégée : la vérification se fait côté serveur,
/// jamais côté navigateur.
export async function exigerUtilisateur(): Promise<UtilisateurConnecte> {
  const utilisateur = await lireUtilisateur();
  if (!utilisateur) redirect("/connexion");
  return utilisateur;
}

/// Exige un utilisateur connecté ayant l'un des rôles autorisés.
export async function exigerRole(...rolesAutorises: Role[]): Promise<UtilisateurConnecte> {
  const utilisateur = await exigerUtilisateur();
  if (!rolesAutorises.includes(utilisateur.role)) redirect("/tableau-de-bord");
  return utilisateur;
}
