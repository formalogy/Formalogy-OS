"use client";

import Link from "next/link";
import { useActionState, useRef } from "react";
import { useFormStatus } from "react-dom";

import {
  basculerApplicabilite,
  basculerIndicateur,
  detacherPreuve,
  enregistrerNotesIndicateur,
  type EtatFormulaire,
} from "@/app/(app)/qualiopi/actions";

export type PreuveIndicateur = { id: string; nom: string; typeNom: string | null };
export type ActionIndicateur = { id: string; titre: string; statut: string };

type Props = {
  numero: number;
  intitule: string;
  specifique: boolean;
  applicable: boolean;
  conforme: boolean;
  notes: string | null;
  preuves: PreuveIndicateur[];
  actions: ActionIndicateur[];
  majPar: string | null;
  majLe: string;
};

function BoutonNotes() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rounded-lg border border-bordure bg-surface px-3 py-1.5 text-[12.5px] font-semibold disabled:opacity-60">
      {pending ? "…" : "Enregistrer"}
    </button>
  );
}

/// Une ligne d'indicateur : case à cocher, intitulé officiel, et le détail
/// dépliable où l'on rattache les preuves et note ce qui est en place.
export function Indicateur(p: Props) {
  const [etat, envoyer] = useActionState<EtatFormulaire, FormData>(enregistrerNotesIndicateur, {});
  const bascule = useRef<HTMLFormElement>(null);

  const resume = p.conforme
    ? { texte: "Conforme", classe: "bg-succes/12 text-succes" }
    : p.preuves.length > 0 || p.notes
      ? { texte: "En préparation", classe: "bg-accent-pale text-accent-fort" }
      : { texte: "À traiter", classe: "bg-alerte/12 text-alerte" };

  return (
    <details className={`group border-t border-bordure-douce first:border-t-0 ${p.applicable ? "" : "opacity-60"}`}>
      <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-3 hover:bg-surface-creuse">
        <form ref={bascule} action={basculerIndicateur} className="pt-0.5">
          <input type="hidden" name="numero" value={p.numero} />
          <input
            type="checkbox"
            checked={p.conforme}
            disabled={!p.applicable}
            aria-label={`Indicateur ${p.numero} conforme`}
            onChange={() => bascule.current?.requestSubmit()}
            onClick={(e) => e.stopPropagation()}
            className="size-4 accent-[var(--color-succes)]"
          />
        </form>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[12px] font-bold text-texte-tenu">Indicateur {p.numero}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${p.applicable ? resume.classe : "bg-surface-creuse text-texte-tenu"}`}>
              {p.applicable ? resume.texte : "Non applicable"}
            </span>
            {p.specifique && (
              <span className="rounded-full bg-bordure-douce px-2 py-0.5 text-[10.5px] font-semibold text-texte-tenu">Spécifique</span>
            )}
            {p.preuves.length > 0 && (
              <span className="text-[11px] text-texte-tenu">
                {p.preuves.length} preuve{p.preuves.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[13px] leading-snug group-open:font-semibold">{p.intitule}</p>
        </div>
        <span aria-hidden="true" className="mt-1 shrink-0 text-[11px] text-texte-tenu group-open:hidden">
          Ouvrir
        </span>
      </summary>

      <div className="flex flex-col gap-4 border-t border-bordure-douce bg-surface-creuse/40 px-4 py-4 pl-11">
        <div>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-[13px] font-bold">Preuves rattachées</h3>
            <Link
              href={`/documents/nouveau?indicateur=${p.numero}&type=PREUVE_QUALIOPI`}
              className="text-[12px] font-semibold text-accent-fort hover:underline"
            >
              Ajouter une preuve
            </Link>
          </div>
          {p.preuves.length === 0 ? (
            <p className="text-[12.5px] text-texte-doux">Aucun document rattaché à cet indicateur.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {p.preuves.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 text-[12.5px]">
                  <Link href={`/documents/${d.id}`} className="font-semibold hover:text-accent-fort">
                    {d.nom}
                    {d.typeNom && <span className="ml-2 font-normal text-texte-tenu">{d.typeNom}</span>}
                  </Link>
                  <form action={detacherPreuve}>
                    <input type="hidden" name="documentId" value={d.id} />
                    <button type="submit" className="text-[11.5px] font-semibold text-texte-tenu hover:text-danger">
                      Détacher
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </div>

        <form action={envoyer}>
          <input type="hidden" name="numero" value={p.numero} />
          <label htmlFor={`notes-${p.numero}`} className="block text-[13px] font-bold">
            Ce qui est en place
          </label>
          <textarea
            id={`notes-${p.numero}`}
            name="notes"
            rows={3}
            defaultValue={p.notes ?? ""}
            placeholder="Où se trouvent les preuves, ce qui reste à faire, ce que vous direz à l'auditeur…"
            className="mt-1.5 w-full rounded-lg border border-bordure bg-surface px-3 py-2 text-[12.8px] font-normal outline-none focus:border-accent focus:ring-2 focus:ring-accent-pale"
          />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <BoutonNotes />
            {etat.succes && <span className="text-[12px] font-semibold text-succes">{etat.succes}</span>}
            {etat.erreur && <span role="alert" className="text-[12px] text-danger">{etat.erreur}</span>}
            <Link href={`/qualiopi/actions?indicateur=${p.numero}`} className="text-[12px] font-semibold text-accent-fort hover:underline">
              Ajouter une action
            </Link>
          </div>
        </form>

        {p.actions.length > 0 && (
          <div>
            <h3 className="mb-1 text-[13px] font-bold">Actions liées</h3>
            <ul className="flex flex-col gap-0.5 text-[12.5px]">
              {p.actions.map((a) => (
                <li key={a.id}>
                  <Link href="/qualiopi/actions" className="hover:text-accent-fort">
                    {a.titre}
                  </Link>{" "}
                  <span className="text-texte-tenu">· {a.statut}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-bordure-douce pt-3 text-[11.5px] text-texte-tenu">
          <span>
            {p.majPar ? `Dernière modification par ${p.majPar}, le ${p.majLe}` : `Dernière modification le ${p.majLe}`}
          </span>
          {p.specifique && (
            <form action={basculerApplicabilite}>
              <input type="hidden" name="numero" value={p.numero} />
              <button type="submit" className="font-semibold text-accent-fort hover:underline">
                {p.applicable ? "Cet indicateur ne me concerne pas" : "Cet indicateur me concerne"}
              </button>
            </form>
          )}
        </div>
      </div>
    </details>
  );
}
