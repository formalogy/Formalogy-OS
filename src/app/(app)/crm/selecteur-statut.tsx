"use client";

import type { StatutProspect } from "@prisma/client";
import { useRef } from "react";

import { changerStatutProspect } from "@/app/(app)/crm/actions";
import { LIBELLE_STATUT, STATUTS_ORDONNES } from "@/lib/crm-libelles";

type Props = {
  id: string;
  statut: StatutProspect;
  classeTon: string;
};

/// Le statut se change directement depuis la liste : c'est l'action la plus
/// fréquente du CRM, elle ne doit pas coûter un aller-retour vers une fiche.
export function SelecteurStatut({ id, statut, classeTon }: Props) {
  const formulaire = useRef<HTMLFormElement>(null);

  return (
    <form ref={formulaire} action={changerStatutProspect}>
      <input type="hidden" name="id" value={id} />
      <select
        // Sans cette clé, React conserve la valeur affichée par le navigateur
        // après l'enregistrement : la pastille indiquerait un statut différent
        // de celui réellement enregistré.
        key={statut}
        name="statut"
        defaultValue={statut}
        aria-label="Statut du prospect"
        onChange={() => formulaire.current?.requestSubmit()}
        className={`cursor-pointer rounded-full border-0 px-2.5 py-1 text-[11.5px] font-semibold outline-none focus:ring-2 focus:ring-accent-pale ${classeTon}`}
      >
        {STATUTS_ORDONNES.map((valeur) => (
          <option key={valeur} value={valeur}>
            {LIBELLE_STATUT[valeur]}
          </option>
        ))}
      </select>
    </form>
  );
}
