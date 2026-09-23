"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { genererConventionsSession, type EtatConventions } from "@/app/(app)/sessions/actions";

function Bouton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg border border-bordure bg-surface px-3 py-1.5 text-[12.5px] font-semibold disabled:opacity-60"
    >
      {pending ? "Génération…" : "Générer les conventions"}
    </button>
  );
}

/// Génération manuelle, pour les sessions créées trop tard pour l'envoi
/// automatique de J-15, ou quand une donnée a changé depuis.
export function GenerationConventions({ sessionId }: { sessionId: string }) {
  const [etat, envoyer] = useActionState<EtatConventions, FormData>(genererConventionsSession, {});

  return (
    <form action={envoyer} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="sessionId" value={sessionId} />
      <Bouton />
      {etat.erreur && <span className="text-[12.5px] text-danger">{etat.erreur}</span>}
      {etat.succes && (
        <span className="text-[12.5px] font-semibold text-succes">
          {etat.succes}
          {etat.manquants && etat.manquants.length > 0 && (
            <span className="ml-2 font-normal text-alerte">
              À compléter à la main dans le document : {etat.manquants.join(", ")}.
            </span>
          )}
        </span>
      )}
    </form>
  );
}
