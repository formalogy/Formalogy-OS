"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icone } from "@/app/(app)/_composants/icones";
import type { GroupeMenu } from "@/lib/navigation";

type Props = {
  groupes: GroupeMenu[];
  ouverte: boolean;
  onFermer: () => void;
};

export function BarreLaterale({ groupes, ouverte, onFermer }: Props) {
  const cheminActuel = usePathname();

  return (
    <>
      {ouverte && (
        <button
          type="button"
          aria-label="Fermer le menu"
          onClick={onFermer}
          className="fixed inset-0 z-20 bg-black/35 lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-bordure bg-surface-creuse transition-transform lg:translate-x-0 ${
          ouverte ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex shrink-0 items-center gap-2.5 px-5 py-5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-accent text-white">
            <Icone nom="boussole" className="size-4" />
          </div>
          <div className="leading-tight">
            <div className="font-titre text-[15px] font-extrabold tracking-tight">
              Formalogy OS
            </div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-texte-tenu">
              Centre de pilotage
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          {groupes.map((groupe) => (
            <div key={groupe.titre} className="mt-3.5 first:mt-0">
              <div className="flex items-center gap-2 px-2 py-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-texte-tenu">
                <Icone nom={groupe.icone} className="size-3.5" />
                {groupe.titre}
              </div>

              {groupe.entrees.map((entree) => {
                if (!entree.chemin) {
                  return (
                    <div
                      key={entree.libelle}
                      title={`Module construit en Phase ${entree.phase}`}
                      className="flex cursor-default items-center justify-between rounded-lg py-1.5 pl-7 pr-2.5 text-[13px] text-texte-tenu"
                    >
                      {entree.libelle}
                      <span className="rounded-full bg-bordure-douce px-1.5 py-px font-texte text-[10px] text-texte-tenu">
                        P{entree.phase}
                      </span>
                    </div>
                  );
                }

                const actif = cheminActuel === entree.chemin;

                return (
                  <Link
                    key={entree.libelle}
                    href={entree.chemin}
                    onClick={onFermer}
                    aria-current={actif ? "page" : undefined}
                    className={`flex items-center rounded-lg py-1.5 text-[13px] transition ${
                      actif
                        ? "border-l-2 border-accent bg-accent-pale pl-[26px] pr-2.5 font-semibold text-accent-fort"
                        : "pl-7 pr-2.5 text-texte-doux hover:bg-bordure-douce hover:text-texte"
                    }`}
                  >
                    {entree.libelle}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-bordure px-5 py-3 text-[11px] text-texte-tenu">
          Les entrées grisées seront construites lors des phases indiquées.
        </div>
      </aside>
    </>
  );
}
