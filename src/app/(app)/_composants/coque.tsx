"use client";

import Form from "next/form";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Assistant } from "@/app/(app)/_composants/assistant";
import { BarreLaterale } from "@/app/(app)/_composants/barre-laterale";
import { Icone } from "@/app/(app)/_composants/icones";
import { signOut } from "@/lib/auth-client";
import type { GroupeMenu } from "@/lib/navigation";
import type { UtilisateurConnecte } from "@/lib/session";

const LIBELLE_ROLE: Record<string, string> = {
  ADMIN: "Administrateur",
  GESTIONNAIRE: "Gestionnaire",
  FORMATEUR: "Formateur",
};

function initiales(nom: string): string {
  return nom
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((mot) => mot[0]?.toUpperCase() ?? "")
    .join("");
}

type Props = {
  utilisateur: UtilisateurConnecte;
  groupes: GroupeMenu[];
  children: React.ReactNode;
};

export function Coque({ utilisateur, groupes, children }: Props) {
  const router = useRouter();
  const [menuOuvert, setMenuOuvert] = useState(false);
  const [deconnexionEnCours, setDeconnexionEnCours] = useState(false);

  return (
    // Mise en page à la manière de HubSpot (choix du client du 30/09/2026) :
    // l'encadrement — menu et barre du haut — est bleu nuit, et le contenu se
    // pose dans un grand panneau clair aux coins arrondis.
    <div className="min-h-screen bg-barre lg:pl-[calc(16rem+1.5rem)]">
      <BarreLaterale
        groupes={groupes}
        ouverte={menuOuvert}
        onFermer={() => setMenuOuvert(false)}
      />

      <header className="sticky top-0 z-10 flex items-center gap-4 bg-barre px-5 py-3 lg:pl-2">
        <button
          type="button"
          aria-label="Ouvrir le menu"
          onClick={() => setMenuOuvert(true)}
          className="flex size-9 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-white lg:hidden"
        >
          <Icone nom="menu" />
        </button>

        {/* La recherche globale parcourt toutes les fiches : réservée à l'équipe. */}
        {utilisateur.role === "FORMATEUR" ? (
          <div className="flex-1" />
        ) : (
          <Form
            action="/recherche"
            role="search"
            className="flex max-w-md flex-1 items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-white/70 focus-within:border-white/40 focus-within:ring-2 focus-within:ring-white/15"
          >
            {/* Un vrai bouton d'envoi : la touche Entrée le déclenche de façon
                fiable, et il reste cliquable. */}
            <button type="submit" aria-label="Lancer la recherche" className="shrink-0 hover:text-white">
              <Icone nom="recherche" className="size-4" />
            </button>
            <input
              type="search"
              name="q"
              aria-label="Recherche globale"
              placeholder="Rechercher un apprenant, une entreprise, une session…"
              className="w-full min-w-0 bg-transparent text-[13px] text-white outline-none placeholder:text-white/60"
            />
          </Form>
        )}

        <div className="ml-auto flex items-center gap-3">
          <div className="hidden text-right leading-tight sm:block">
            <div className="text-[12.8px] font-semibold text-white">{utilisateur.name}</div>
            <div className="text-[11px] text-white/70">
              {LIBELLE_ROLE[utilisateur.role]}
            </div>
          </div>
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-barre-logo font-titre text-[12.5px] font-semibold text-white">
            {initiales(utilisateur.name)}
          </div>
          <button
            type="button"
            disabled={deconnexionEnCours}
            onClick={async () => {
              setDeconnexionEnCours(true);
              await signOut();
              router.push("/connexion");
              router.refresh();
            }}
            className="rounded-full px-4 py-2 text-[12.5px] font-semibold text-white/85 transition hover:bg-white/10 hover:text-white disabled:opacity-60"
          >
            {deconnexionEnCours ? "…" : "Quitter"}
          </button>
        </div>
      </header>

      <div className="mx-3 mb-3 min-h-[calc(100vh-4.5rem)] rounded-3xl bg-fond lg:ml-0">
        <main className="mx-auto w-full max-w-6xl px-5 py-6">{children}</main>
      </div>

      {/* L'assistant IA lit toute la base : réservé à l'équipe. */}
      {utilisateur.role !== "FORMATEUR" && <Assistant />}
    </div>
  );
}
