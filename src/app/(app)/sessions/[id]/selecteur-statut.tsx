"use client";

import type { StatutSession } from "@prisma/client";
import { useRef } from "react";

import { changerStatutSession } from "@/app/(app)/sessions/actions";
import { LIBELLE_STATUT_SESSION, STATUTS_SESSION } from "@/lib/sessions-libelles";

type Props = { id: string; statut: StatutSession; classeTon: string };

export function SelecteurStatutSession({ id, statut, classeTon }: Props) {
  const formulaire = useRef<HTMLFormElement>(null);

  return (
    <form ref={formulaire} action={changerStatutSession}>
      <input type="hidden" name="id" value={id} />
      <select
        // Sans cette clé, la pastille continuerait d'afficher l'ancien statut
        // après enregistrement.
        key={statut}
        name="statut"
        defaultValue={statut}
        aria-label="Statut de la session"
        onChange={() => formulaire.current?.requestSubmit()}
        className={`cursor-pointer rounded-full border-0 px-3 py-2 text-[12.5px] font-semibold outline-none focus:ring-2 focus:ring-accent-pale ${classeTon}`}
      >
        {STATUTS_SESSION.map((valeur) => (
          <option key={valeur} value={valeur}>
            {LIBELLE_STATUT_SESSION[valeur]}
          </option>
        ))}
      </select>
    </form>
  );
}
