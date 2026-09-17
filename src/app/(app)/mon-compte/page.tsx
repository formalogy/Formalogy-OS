import { ChangementMotDePasse } from "@/app/(app)/mon-compte/mot-de-passe";
import { exigerUtilisateur } from "@/lib/session";

const LIBELLE_ROLE = { ADMIN: "Administrateur", GESTIONNAIRE: "Gestionnaire", FORMATEUR: "Formateur" };

export default async function PageMonCompte() {
  const utilisateur = await exigerUtilisateur();

  return (
    <>
      <header className="mb-6">
        <h1 className="text-[22px] font-extrabold tracking-tight">Mon compte</h1>
        <p className="mt-1 text-[12.8px] text-texte-doux">
          {utilisateur.name} · {utilisateur.email} · {LIBELLE_ROLE[utilisateur.role]}
        </p>
      </header>

      <ChangementMotDePasse />
    </>
  );
}
