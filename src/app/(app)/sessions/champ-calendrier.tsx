"use client";

import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { useState } from "react";

/// Jours de formation cochés sur un calendrier (demande du client du
/// 05/10/2026) : une formation peut se tenir un samedi, ou sauter des jours.
/// Les jours voyagent au format « AAAA-MM-JJ », séparés par des virgules.

const MOIS = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
const COURT = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const ENTETES = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"];

const iso = (d: Date) => d.toISOString().slice(0, 10);
const jourUTC = (a: number, m: number, j: number) => new Date(Date.UTC(a, m, j));

export function ChampCalendrier({ jours, onChange }: { jours: string[]; onChange: (jours: string[]) => void }) {
  const maintenant = new Date();
  const depart = jours[0] ? new Date(`${jours[0]}T00:00:00Z`) : jourUTC(maintenant.getFullYear(), maintenant.getMonth(), 1);
  const [mois, setMois] = useState({ a: depart.getUTCFullYear(), m: depart.getUTCMonth() });
  const aujourdhui = iso(jourUTC(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate()));

  const premier = jourUTC(mois.a, mois.m, 1);
  const decalage = (premier.getUTCDay() + 6) % 7; // lundi en premier
  const nbJours = jourUTC(mois.a, mois.m + 1, 0).getUTCDate();
  const cases: (Date | null)[] = [...Array(decalage).fill(null), ...Array.from({ length: nbJours }, (_, i) => jourUTC(mois.a, mois.m, i + 1))];
  const choisis = new Set(jours);

  const basculer = (j: string) => onChange(choisis.has(j) ? jours.filter((x) => x !== j) : [...jours, j].sort());
  const changerMois = (pas: number) => setMois(({ a, m }) => ({ a: a + Math.floor((m + pas) / 12), m: (((m + pas) % 12) + 12) % 12 }));

  return (
    <fieldset className="sm:col-span-2">
      <legend className="text-[12.5px] font-semibold">Jours de formation</legend>
      <input type="hidden" name="jours" value={jours.join(",")} />
      <div className="mt-1 flex flex-wrap items-start gap-4">
        <div className="w-[17.5rem] rounded-xl border border-bordure bg-surface p-3">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={() => changerMois(-1)} aria-label="Mois précédent" className="flex size-7 items-center justify-center rounded-full hover:bg-surface-creuse">
              <IconChevronLeft className="size-4" aria-hidden="true" />
            </button>
            <span className="text-[13px] font-semibold capitalize">{MOIS.format(premier)}</span>
            <button type="button" onClick={() => changerMois(1)} aria-label="Mois suivant" className="flex size-7 items-center justify-center rounded-full hover:bg-surface-creuse">
              <IconChevronRight className="size-4" aria-hidden="true" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center">
            {ENTETES.map((e) => (
              <span key={e} className="py-1 text-[10.5px] font-semibold uppercase text-texte-tenu">{e}</span>
            ))}
            {cases.map((d, i) => {
              if (!d) return <span key={`v${i}`} />;
              const j = iso(d);
              const coche = choisis.has(j);
              const weekEnd = d.getUTCDay() === 0 || d.getUTCDay() === 6;
              return (
                <button
                  key={j}
                  type="button"
                  onClick={() => basculer(j)}
                  aria-pressed={coche}
                  aria-label={COURT.format(d)}
                  className={`h-8 rounded-lg text-[12.5px] tabular-nums transition ${
                    coche ? "bg-accent font-bold text-white" : `hover:bg-accent-pale ${weekEnd ? "text-texte-tenu" : ""}`
                  } ${j === aujourdhui && !coche ? "ring-1 ring-accent" : ""}`}
                >
                  {d.getUTCDate()}
                </button>
              );
            })}
          </div>
        </div>
        <div className="min-w-0 flex-1 text-[12.5px]">
          {jours.length === 0 ? (
            <p className="text-texte-tenu">Cliquez sur les jours de formation, samedi compris si besoin. Changez de mois avec les flèches.</p>
          ) : (
            <>
              <p className="font-semibold">
                {jours.length} jour{jours.length > 1 ? "s" : ""} de formation
              </p>
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {jours.map((j) => (
                  <li key={j}>
                    <button type="button" onClick={() => basculer(j)} title="Retirer ce jour" className="rounded-full bg-surface-creuse px-2.5 py-0.5 text-[12px] hover:bg-danger-pale hover:text-danger">
                      {COURT.format(new Date(`${j}T00:00:00Z`))} ×
                    </button>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => onChange([])} className="mt-2 text-[12px] font-semibold text-texte-doux underline">
                Tout effacer
              </button>
            </>
          )}
        </div>
      </div>
    </fieldset>
  );
}
