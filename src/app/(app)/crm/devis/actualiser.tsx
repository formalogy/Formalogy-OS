"use client";

import { useActionState } from "react";

import { actualiserDevis, type EtatDevis } from "@/app/(app)/crm/devis/actions";

/// Reprise immédiate des devis de Henrri (elle se fait aussi à chaque réveil).
export function BoutonActualiser() {
  const [etat, actualiser, enCours] = useActionState<EtatDevis>(actualiserDevis, {});
  return (
    <form action={actualiser} className="flex flex-wrap items-center gap-2">
      {(etat.message || etat.erreur) && (
        <span className={`text-[12px] ${etat.erreur ? "text-danger" : "text-texte-doux"}`}>{etat.erreur ?? etat.message}</span>
      )}
      <button type="submit" disabled={enCours} className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60">
        {enCours ? "Lecture de Henrri…" : "Actualiser depuis Henrri"}
      </button>
    </form>
  );
}
