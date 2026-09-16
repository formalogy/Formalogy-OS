"use client";

import type { StatutDocument } from "@prisma/client";
import { useRef, useState } from "react";

import { changerStatutDocument, supprimerDocument } from "@/app/(app)/documents/actions";
import { LIBELLE_STATUT_DOCUMENT, STATUTS_DOCUMENT } from "@/lib/documents-libelles";

type Props = {
  id: string;
  statut: StatutDocument;
  classeTon: string;
  peutSupprimer: boolean;
};

export function ActionsDocument({ id, statut, classeTon, peutSupprimer }: Props) {
  const formulaireStatut = useRef<HTMLFormElement>(null);
  const [confirmation, setConfirmation] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form ref={formulaireStatut} action={changerStatutDocument}>
        <input type="hidden" name="id" value={id} />
        <select
          key={statut}
          name="statut"
          defaultValue={statut}
          aria-label="Statut du document"
          onChange={() => formulaireStatut.current?.requestSubmit()}
          className={`cursor-pointer rounded-full border-0 px-3 py-2 text-[12.5px] font-semibold outline-none focus:ring-2 focus:ring-accent-pale ${classeTon}`}
        >
          {STATUTS_DOCUMENT.map((s) => (
            <option key={s} value={s}>{LIBELLE_STATUT_DOCUMENT[s]}</option>
          ))}
        </select>
      </form>

      {peutSupprimer &&
        (confirmation ? (
          <form action={supprimerDocument} className="flex items-center gap-2 rounded-lg bg-danger-pale px-2 py-1">
            <input type="hidden" name="id" value={id} />
            <span className="text-[12px] text-danger">Supprimer ce document ?</span>
            <button type="submit" className="rounded-md bg-danger px-2 py-1 text-[12px] font-semibold text-white">
              Oui, supprimer
            </button>
            <button type="button" onClick={() => setConfirmation(false)} className="px-1 text-[12px] font-semibold text-texte-doux">
              Annuler
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmation(true)}
            className="rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] font-semibold text-texte-doux hover:text-danger"
          >
            Supprimer
          </button>
        ))}
    </div>
  );
}
