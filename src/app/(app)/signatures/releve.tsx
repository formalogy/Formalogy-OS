"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { releverBoiteMaintenant, type EtatReleve } from "@/app/(app)/signatures/actions";

function Bouton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rounded-lg border border-bordure bg-surface px-4 py-2 text-[13px] font-semibold disabled:opacity-60">
      {pending ? "Relève en cours…" : "Relever la boîte maintenant"}
    </button>
  );
}

export function ReleveBoite({ configuree }: { configuree: boolean }) {
  const [etat, relever] = useActionState<EtatReleve>(releverBoiteMaintenant, {});

  if (!configuree) {
    return (
      <p className="max-w-sm text-right text-[12px] text-texte-tenu">
        Récupération automatique inactive : la boîte Gmail dédiée n&apos;est pas encore configurée. Dépôt manuel possible.
      </p>
    );
  }

  return (
    <form action={relever} className="flex flex-col items-end gap-1">
      <Bouton />
      {etat.message && <p className="text-[12px] font-semibold text-succes">{etat.message}</p>}
      {etat.erreur && <p role="alert" className="text-[12px] text-danger">{etat.erreur}</p>}
    </form>
  );
}
