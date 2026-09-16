"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  basculerAutomatisation,
  lancerAutomatisations,
  type EtatFormulaire,
} from "@/app/(app)/parametres/actions";

function BoutonInterrupteur({ actif, modifiable }: { actif: boolean; modifiable: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={!modifiable || pending}
      role="switch"
      aria-checked={actif}
      aria-label={actif ? "Désactiver l'automatisation" : "Activer l'automatisation"}
      className="flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-70"
    >
      <span className={`text-[12.5px] font-semibold ${actif ? "text-accent-fort" : "text-texte-tenu"}`}>
        {pending ? "…" : actif ? "Active" : "Désactivée"}
      </span>
      <span className={`relative h-6 w-11 rounded-full transition ${actif ? "bg-accent" : "bg-bordure"}`}>
        <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition ${actif ? "left-[22px]" : "left-0.5"}`} />
      </span>
    </button>
  );
}

export function InterrupteurAutomatisation({ id, actif, modifiable }: { id: string; actif: boolean; modifiable: boolean }) {
  const [etat, envoyer] = useActionState<EtatFormulaire, FormData>(basculerAutomatisation, {});
  return (
    <form action={envoyer} className="flex flex-col items-end gap-1">
      <input type="hidden" name="id" value={id} />
      <BoutonInterrupteur actif={actif} modifiable={modifiable} />
      {etat.erreur && <p role="alert" className="max-w-xs text-right text-[11.5px] text-danger">{etat.erreur}</p>}
    </form>
  );
}

function BoutonLancement() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rounded-lg border border-bordure bg-surface px-4 py-2 text-[13px] font-semibold disabled:opacity-60">
      {pending ? "Exécution…" : "Exécuter les automatisations planifiées"}
    </button>
  );
}

/// Déclenche à la main ce que le réveil quotidien fait automatiquement.
export function LancementManuel() {
  const [etat, envoyer] = useActionState<EtatFormulaire, FormData>(lancerAutomatisations, {});
  return (
    <form action={envoyer} className="flex flex-col items-end gap-1">
      <BoutonLancement />
      {etat.succes && <p className="text-[12px] font-semibold text-succes">{etat.succes}</p>}
    </form>
  );
}
