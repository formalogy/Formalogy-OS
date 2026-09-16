import { redirect } from "next/navigation";

import { lireUtilisateur } from "@/lib/session";

// L'application n'a pas de page publique : la racine oriente simplement vers
// le tableau de bord ou l'écran de connexion.
export default async function PageRacine() {
  const utilisateur = await lireUtilisateur();
  redirect(utilisateur ? "/tableau-de-bord" : "/connexion");
}
