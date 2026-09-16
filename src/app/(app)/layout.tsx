import { Coque } from "@/app/(app)/_composants/coque";
import { menuPourRole } from "@/lib/navigation";
import { exigerUtilisateur } from "@/lib/session";

// Toutes les pages de l'application passent par ici : la session est vérifiée
// côté serveur avant qu'aucun contenu ne soit produit.
export default async function LayoutApplication({
  children,
}: {
  children: React.ReactNode;
}) {
  const utilisateur = await exigerUtilisateur();

  return (
    <Coque utilisateur={utilisateur} groupes={menuPourRole(utilisateur.role)}>
      {children}
    </Coque>
  );
}
