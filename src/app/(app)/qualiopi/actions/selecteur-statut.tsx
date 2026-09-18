"use client";

import { changerStatutAction } from "@/app/(app)/qualiopi/actions";
import { LIBELLE_STATUT_ACTION, STATUTS_ACTION, TON_STATUT_ACTION } from "@/lib/qualiopi";
import type { StatutActionQualite } from "@prisma/client";

/// Changement de statut au choix dans la liste, sans bouton à cliquer.
export function SelecteurStatutAction({ id, statut, titre }: { id: string; statut: StatutActionQualite; titre: string }) {
  return (
    <form action={changerStatutAction}>
      <input type="hidden" name="id" value={id} />
      <select
        key={statut}
        name="statut"
        defaultValue={statut}
        aria-label={`Statut de « ${titre} »`}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className={`cursor-pointer rounded-full border-0 px-3 py-1.5 text-[12px] font-semibold outline-none focus:ring-2 focus:ring-accent-pale ${TON_STATUT_ACTION[statut]}`}
      >
        {STATUTS_ACTION.map((s) => (
          <option key={s} value={s}>
            {LIBELLE_STATUT_ACTION[s]}
          </option>
        ))}
      </select>
    </form>
  );
}
