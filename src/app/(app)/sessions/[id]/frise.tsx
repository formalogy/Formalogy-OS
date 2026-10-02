import { IconAlertTriangle, IconCircleCheck, IconClock, IconHourglass, IconPlayerPause } from "@tabler/icons-react";

import type { EtatEtape, Phase } from "@/lib/session-frise";

const jour = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

const ETATS: Record<EtatEtape, { libelle: string; classe: string; Icone: typeof IconClock }> = {
  fait: { libelle: "Fait", classe: "text-succes", Icone: IconCircleCheck },
  echec: { libelle: "Échec", classe: "text-danger", Icone: IconAlertTriangle },
  du: { libelle: "À partir", classe: "text-alerte", Icone: IconHourglass },
  prevu: { libelle: "Prévu", classe: "text-texte-tenu", Icone: IconClock },
  attente: { libelle: "En attente", classe: "text-texte-tenu", Icone: IconPlayerPause },
};

/// Frise « Déroulement de la session » : ce qui est prévu, parti, en échec.
export function FriseSession({ phases }: { phases: Phase[] }) {
  if (phases.length === 0) return null;
  return (
    <section className="rounded-xl border border-bordure bg-surface p-5 shadow-sm">
      <h2 className="text-[14.5px] font-bold">Déroulement de la session</h2>
      <p className="mb-4 mt-0.5 text-[12px] text-texte-tenu">Ce que l&apos;application envoie et produit seule, date par date.</p>
      <div className="flex flex-col gap-5">
        {phases.map((phase) => (
          <div key={phase.titre}>
            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-texte-tenu">{phase.titre}</h3>
            <ol className="relative ml-2 border-l border-bordure">
              {phase.etapes.map((e, i) => {
                const { libelle, classe, Icone } = ETATS[e.etat];
                return (
                  <li key={`${e.libelle}-${i}`} className="relative pb-3 pl-5 last:pb-0">
                    <span className={`absolute -left-[9px] top-0.5 flex size-[17px] items-center justify-center rounded-full bg-surface ${classe}`}>
                      <Icone className="size-[17px]" stroke={1.9} aria-hidden="true" />
                    </span>
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-[11.5px] font-semibold text-texte-doux">
                        {e.jour ? jour.format(e.jour) : "Dès que possible"}
                        {e.heure !== null && ` · ${Math.floor(e.heure)} h${e.heure % 1 ? "30" : ""}`}
                      </span>
                      <span className={`text-[11px] font-semibold ${classe}`}>{libelle}</span>
                    </div>
                    <div className="text-[13px]">{e.libelle}</div>
                    {e.detail && <div className="text-[11.5px] text-texte-tenu">{e.detail}</div>}
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </div>
    </section>
  );
}
