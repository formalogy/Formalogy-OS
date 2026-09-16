"use client";

import type { StatutApprenant } from "@prisma/client";
import { useRef } from "react";

import { changerStatutApprenant } from "@/app/(app)/apprenants/actions";
import {
  LIBELLE_STATUT_APPRENANT,
  STATUTS_APPRENANT,
} from "@/lib/apprenants-libelles";

type Props = {
  id: string;
  statut: StatutApprenant;
  classeTon: string;
};

export function SelecteurStatutApprenant({ id, statut, classeTon }: Props) {
  const formulaire = useRef<HTMLFormElement>(null);

  return (
    <form ref={formulaire} action={changerStatutApprenant}>
      <input type="hidden" name="id" value={id} />
      <select
        // Sans cette clé, la pastille continuerait d'afficher l'ancien statut
        // après enregistrement.
        key={statut}
        name="statut"
        defaultValue={statut}
        aria-label="Statut de l'apprenant"
        onChange={() => formulaire.current?.requestSubmit()}
        className={`cursor-pointer rounded-full border-0 px-3 py-1.5 text-[12px] font-semibold outline-none focus:ring-2 focus:ring-accent-pale ${classeTon}`}
      >
        {STATUTS_APPRENANT.map((valeur) => (
          <option key={valeur} value={valeur}>
            {LIBELLE_STATUT_APPRENANT[valeur]}
          </option>
        ))}
      </select>
    </form>
  );
}
