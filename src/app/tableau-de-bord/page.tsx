import { BoutonDeconnexion } from "@/app/tableau-de-bord/bouton-deconnexion";
import { exigerUtilisateur } from "@/lib/session";

const LIBELLE_ROLE: Record<string, string> = {
  ADMIN: "Administrateur",
  GESTIONNAIRE: "Gestionnaire",
  FORMATEUR: "Formateur",
};

export default async function PageTableauDeBord() {
  const utilisateur = await exigerUtilisateur();

  return (
    <main className="mx-auto w-full max-w-3xl p-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Tableau de bord</h1>
          <p className="mt-1 text-sm text-texte-doux">
            Connecté en tant que {utilisateur.name} — {LIBELLE_ROLE[utilisateur.role]}
          </p>
        </div>
        <BoutonDeconnexion />
      </header>

      <section className="mt-8 rounded-xl border border-bordure bg-surface p-6 shadow-sm">
        <h2 className="text-base font-bold">Phase 2 terminée</h2>
        <p className="mt-2 text-sm text-texte-doux">
          La base de données et l&apos;authentification fonctionnent. Cette page est
          protégée : la vérification se fait côté serveur, à chaque affichage.
        </p>
        <p className="mt-4 text-sm text-texte-doux">
          Prochaine étape — Phase 3 : la navigation complète et le véritable tableau
          de bord, avec les indicateurs connectés à la base.
        </p>
      </section>
    </main>
  );
}
