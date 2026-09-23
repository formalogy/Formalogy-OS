import { formaterMontant } from "@/lib/factures";

const MOIS_COURT = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const MOIS_LONG = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

const pourcent = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 1 });
const nombre = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

export const formaterPourcent = (part: number | null) => (part === null ? "—" : pourcent.format(part));
export const formaterNombre = (valeur: number) => nombre.format(valeur);

export function Bloc({ titre, precision, children }: { titre: string; precision?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-bordure bg-surface p-5 shadow-sm">
      <h2 className="text-[15px] font-bold">{titre}</h2>
      {precision && <p className="mt-1 text-[12.5px] text-texte-doux">{precision}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function Indicateur({ libelle, valeur, precision }: { libelle: string; valeur: string; precision?: string }) {
  return (
    <div className="rounded-xl border border-bordure bg-surface p-4 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-texte-tenu">{libelle}</div>
      <div className="mt-2 font-mono text-2xl font-semibold tabular-nums">{valeur}</div>
      {precision && <div className="mt-2.5 border-t border-bordure-douce pt-2.5 text-[11.5px] text-texte-doux">{precision}</div>}
    </div>
  );
}

export function Vide({ message }: { message: string }) {
  return <p className="py-6 text-center text-[13px] text-texte-doux">{message}</p>;
}

/// Chiffre d'affaires facturé mois par mois. Une seule série : son intitulé
/// est dans le titre du bloc, pas besoin de légende. Seul le meilleur mois
/// porte son montant ; les autres se lisent au survol et dans le tableau.
export function BarresMensuelles({ parMois, annee }: { parMois: number[]; annee: number }) {
  const maximum = Math.max(...parMois);
  if (maximum === 0) return <Vide message="Aucune facture émise sur cette année." />;
  const moisMax = parMois.indexOf(maximum);

  return (
    <>
      <div className="flex h-44 items-end gap-1.5" role="img" aria-label={`Chiffre d'affaires facturé mois par mois en ${annee}`}>
        {parMois.map((centimes, mois) => (
          <div key={mois} className="flex h-full flex-1 flex-col justify-end gap-1.5">
            {mois === moisMax && (
              <div className="text-center font-mono text-[11px] font-semibold tabular-nums text-texte-doux">
                {formaterMontant(centimes / 100)}
              </div>
            )}
            <div
              title={`${MOIS_LONG[mois]} ${annee} — ${formaterMontant(centimes / 100)}`}
              style={{ height: `${Math.max((centimes / maximum) * 100, centimes > 0 ? 1.5 : 0)}%` }}
              className="w-full rounded-t-[4px] bg-accent"
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1.5 border-t border-bordure pt-1.5">
        {MOIS_COURT.map((initiale, mois) => (
          <div key={mois} className={`flex-1 text-center text-[11px] ${mois === moisMax ? "font-semibold text-texte-doux" : "text-texte-tenu"}`}>
            {initiale}
          </div>
        ))}
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-[12px] font-semibold text-texte-doux">Voir les chiffres mois par mois</summary>
        <table className="mt-2 w-full border-collapse text-[12.5px]">
          <tbody>
            {parMois.map((centimes, mois) => (
              <tr key={mois} className="border-t border-bordure-douce">
                <td className="py-1.5 capitalize text-texte-doux">{MOIS_LONG[mois]}</td>
                <td className="py-1.5 text-right font-mono tabular-nums">{formaterMontant(centimes / 100)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  );
}

export type Part = { libelle: string; valeur: number; couleur: string };

/// Répartition d'un tout en trois parts allant du favorable au défavorable :
/// vert → gris neutre → rouge. Chaque part est nommée et chiffrée dans la
/// légende : la couleur n'est jamais la seule information.
export function BarreProportion({ parts, total, unite }: { parts: Part[]; total: number; unite: string }) {
  if (total === 0) return <Vide message={`Aucune ${unite} enregistrée sur cette année.`} />;

  return (
    <>
      <div className="flex h-5 gap-[2px] overflow-hidden" role="img" aria-label={parts.map((p) => `${p.libelle} : ${p.valeur}`).join(", ")}>
        {parts
          .filter((p) => p.valeur > 0)
          .map((part, index, visibles) => {
            const proportion = part.valeur / total;
            return (
              <div
                key={part.libelle}
                title={`${part.libelle} — ${part.valeur} (${pourcent.format(proportion)})`}
                style={{ width: `${proportion * 100}%` }}
                className={`${part.couleur} ${index === 0 ? "rounded-l-[4px]" : ""} ${index === visibles.length - 1 ? "rounded-r-[4px]" : ""}`}
              />
            );
          })}
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
        {parts.map((part) => (
          <li key={part.libelle} className="flex items-center gap-2 text-[12.5px]">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${part.couleur}`} aria-hidden />
            <span className="text-texte-doux">{part.libelle}</span>
            <span className="font-mono font-semibold tabular-nums">{part.valeur}</span>
            <span className="text-texte-tenu">({pourcent.format(part.valeur / total)})</span>
          </li>
        ))}
      </ul>
    </>
  );
}

/// Notes moyennes question par question, sur 5.
export function BarresNotes({ lignes }: { lignes: { libelle: string; moyenne: number | null; nombre: number }[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {lignes.map((ligne) => (
        <li key={ligne.libelle}>
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-[12.5px] text-texte-doux">{ligne.libelle}</span>
            <span className="shrink-0 font-mono text-[13px] font-semibold tabular-nums">
              {ligne.moyenne === null ? "—" : `${nombre.format(Math.round(ligne.moyenne * 10) / 10)} / 5`}
            </span>
          </div>
          <div className="mt-1.5 h-2 rounded-[4px] bg-surface-creuse">
            {ligne.moyenne !== null && (
              <div
                title={`${ligne.libelle} — ${nombre.format(Math.round(ligne.moyenne * 10) / 10)} sur 5, ${ligne.nombre} réponse(s)`}
                style={{ width: `${(ligne.moyenne / 5) * 100}%` }}
                className="h-full rounded-[4px] bg-accent"
              />
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
