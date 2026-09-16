"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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
    <div className="min-h-screen lg:pl-64">
      <BarreLaterale
        groupes={groupes}
        ouverte={menuOuvert}
        onFermer={() => setMenuOuvert(false)}
      />

      <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-bordure bg-fond px-5 py-3">
        <button
          type="button"
          aria-label="Ouvrir le menu"
          onClick={() => setMenuOuvert(true)}
          className="flex size-9 items-center justify-center rounded-lg border border-bordure bg-surface text-texte-doux lg:hidden"
        >
          <Icone nom="menu" />
        </button>

        <div className="flex max-w-md flex-1 items-center gap-2 rounded-lg border border-bordure bg-surface px-3 py-2 text-texte-tenu">
          <Icone nom="recherche" className="size-4 shrink-0" />
          <span className="truncate text-[13px]">
            Recherche globale — disponible en Phase 4
          </span>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <div className="hidden text-right leading-tight sm:block">
            <div className="text-[12.8px] font-semibold">{utilisateur.name}</div>
            <div className="text-[11px] text-texte-tenu">
              {LIBELLE_ROLE[utilisateur.role]}
            </div>
          </div>
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-fort font-titre text-[12.5px] font-bold text-white">
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
            className="rounded-lg border border-bordure bg-surface px-3 py-1.5 text-[12.5px] font-semibold transition disabled:opacity-60"
          >
            {deconnexionEnCours ? "…" : "Quitter"}
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-5 py-6">{children}</main>
    </div>
  );
}
