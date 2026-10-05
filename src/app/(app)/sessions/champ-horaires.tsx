"use client";

import { useState } from "react";

/// Horaires d'une session choisis dans des listes (demande du client du
/// 05/10/2026) plutôt que tapés : matin et après-midi, début et fin. Le
/// texte enregistré garde le format lu partout ailleurs (convocation,
/// émargement) : « 9h00–12h30 / 13h30–17h00 ».

type Heure = { h: string; m: string };
type Horaires = { matinDebut: Heure; matinFin: Heure; apresDebut: Heure; apresFin: Heure };

const PAR_DEFAUT: Horaires = {
  matinDebut: { h: "9", m: "00" },
  matinFin: { h: "12", m: "30" },
  apresDebut: { h: "13", m: "30" },
  apresFin: { h: "17", m: "00" },
};
const HEURES = Array.from({ length: 16 }, (_, i) => String(i + 6)); // 6 h à 21 h
const MINUTES = ["00", "15", "30", "45"];

/// Relit un horaire déjà enregistré (« 9h00–12h30 / 13h30–17h00 », « 9h–17h »).
function lire(texte: string | undefined): Horaires {
  const heures = [...(texte ?? "").matchAll(/(\d{1,2})\s*[hH:]\s*(\d{2})?/g)].map((x) => ({ h: String(Number(x[1])), m: x[2] ?? "00" }));
  const arrondi = (x: Heure): Heure => ({ h: HEURES.includes(x.h) ? x.h : "9", m: MINUTES.includes(x.m) ? x.m : "00" });
  if (heures.length >= 4) return { matinDebut: arrondi(heures[0]), matinFin: arrondi(heures[1]), apresDebut: arrondi(heures[2]), apresFin: arrondi(heures[3]) };
  if (heures.length === 2) return { ...PAR_DEFAUT, matinDebut: arrondi(heures[0]), apresFin: arrondi(heures[1]) };
  return PAR_DEFAUT;
}

const ecrire = (x: Horaires) =>
  `${x.matinDebut.h}h${x.matinDebut.m}–${x.matinFin.h}h${x.matinFin.m} / ${x.apresDebut.h}h${x.apresDebut.m}–${x.apresFin.h}h${x.apresFin.m}`;

const LISTE = "rounded-lg border border-bordure bg-surface px-1.5 py-1.5 text-[13px] outline-none focus:border-accent";

function ChoixHeure({ valeur, onChange, libelle }: { valeur: Heure; onChange: (h: Heure) => void; libelle: string }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      <select aria-label={`${libelle} — heures`} value={valeur.h} onChange={(e) => onChange({ ...valeur, h: e.target.value })} className={LISTE}>
        {HEURES.map((h) => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>
      <span className="text-[12px] text-texte-tenu">h</span>
      <select aria-label={`${libelle} — minutes`} value={valeur.m} onChange={(e) => onChange({ ...valeur, m: e.target.value })} className={LISTE}>
        {MINUTES.map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
    </span>
  );
}

/// Jours de formation entre deux dates (« AAAA-MM-JJ ») : les samedis et
/// dimanches au milieu ne comptent pas, comme pour l'émargement.
function joursDeFormation(debut: string, fin: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(debut) || !/^\d{4}-\d{2}-\d{2}$/.test(fin) || fin < debut) return 0;
  let n = 0;
  for (let d = new Date(`${debut}T00:00:00Z`), f = new Date(`${fin}T00:00:00Z`); d <= f && n < 400; d.setUTCDate(d.getUTCDate() + 1)) {
    const extremite = d.toISOString().slice(0, 10) === debut || d.toISOString().slice(0, 10) === fin;
    if (extremite || (d.getUTCDay() !== 0 && d.getUTCDay() !== 6)) n++;
  }
  return n;
}

const enHeures = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
};

type Props = {
  valeurParDefaut?: string;
  dateDebut: string;
  dateFin: string;
  /// Durée prévue de la formation choisie, pour comparaison
  dureeFormation: number | null;
  /// E-learning : les horaires n'ont pas de sens, pas de calcul
  enLigne: boolean;
};

export function ChampHoraires({ valeurParDefaut, dateDebut, dateFin, dureeFormation, enLigne }: Props) {
  const [h, setH] = useState<Horaires>(() => lire(valeurParDefaut));
  const maj = (cle: keyof Horaires) => (v: Heure) => setH((x) => ({ ...x, [cle]: v }));
  const minutes = (x: Heure) => Number(x.h) * 60 + Number(x.m);
  const incoherent =
    minutes(h.matinFin) <= minutes(h.matinDebut) || minutes(h.apresDebut) < minutes(h.matinFin) || minutes(h.apresFin) <= minutes(h.apresDebut);

  return (
    <fieldset className="sm:col-span-2">
      <legend className="text-[12.5px] font-semibold">Horaires</legend>
      <input type="hidden" name="horaires" value={ecrire(h)} />
      <div className="mt-1 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px]">
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <span className="w-20 font-semibold text-texte-doux">Matin</span>
          <ChoixHeure libelle="Début du matin" valeur={h.matinDebut} onChange={maj("matinDebut")} />
          <span className="text-texte-tenu">à</span>
          <ChoixHeure libelle="Fin du matin" valeur={h.matinFin} onChange={maj("matinFin")} />
        </span>
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <span className="w-20 font-semibold text-texte-doux">Après-midi</span>
          <ChoixHeure libelle="Début de l'après-midi" valeur={h.apresDebut} onChange={maj("apresDebut")} />
          <span className="text-texte-tenu">à</span>
          <ChoixHeure libelle="Fin de l'après-midi" valeur={h.apresFin} onChange={maj("apresFin")} />
        </span>
      </div>
      {incoherent && <p className="mt-1 text-[11.5px] text-alerte">Vérifiez les horaires : une fin précède son début.</p>}
      {!incoherent && !enLigne && (() => {
        const parJour = minutes(h.matinFin) - minutes(h.matinDebut) + (minutes(h.apresFin) - minutes(h.apresDebut));
        const jours = joursDeFormation(dateDebut, dateFin);
        const total = parJour * jours;
        const ecart = dureeFormation !== null && jours > 0 && Math.abs(total - dureeFormation * 60) >= 15;
        return (
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 rounded-lg bg-surface-creuse px-3 py-2 text-[12.5px]">
            <span>
              Par jour : <strong>{enHeures(parJour)}</strong>
            </span>
            <span>
              {jours > 0 ? (
                <>
                  Total : <strong>{enHeures(total)}</strong> sur {jours} jour{jours > 1 ? "s" : ""}
                </>
              ) : (
                <span className="text-texte-tenu">Total : choisissez les dates</span>
              )}
            </span>
            {dureeFormation !== null && (
              <span className={ecart ? "font-semibold text-alerte" : "text-texte-tenu"}>
                Durée prévue de la formation : {enHeures(Math.round(dureeFormation * 60))}
                {ecart && " — ne correspond pas"}
              </span>
            )}
          </div>
        );
      })()}
    </fieldset>
  );
}
