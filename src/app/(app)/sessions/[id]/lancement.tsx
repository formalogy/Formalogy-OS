"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { lancerDeroulementSession, type EtatDeroulement } from "@/app/(app)/sessions/actions";

function Bouton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white transition disabled:opacity-60"
    >
      {pending ? "Mise en route…" : "Lancer le déroulement automatique"}
    </button>
  );
}

/// Affiché tant que la session est un brouillon : c'est le seul geste à faire
/// après l'avoir créée. Une fois lancée, le panneau reste le temps d'annoncer
/// ce qui est parti — sans quoi on cliquerait sans jamais savoir.
export function LancementSession({ sessionId, brouillon }: { sessionId: string; brouillon: boolean }) {
  const [etat, envoyer] = useActionState<EtatDeroulement, FormData>(lancerDeroulementSession, {});

  if (!brouillon && !etat.succes && !etat.erreur) return null;

  if (etat.succes) {
    return (
      <section className="rounded-xl border border-succes/40 bg-succes/8 p-5 shadow-sm">
        <h2 className="text-[14.5px] font-bold text-succes">Session en route</h2>
        <p className="mt-1 text-[12.5px] text-texte-doux">{etat.succes.replace("Session en route. ", "")}</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-accent bg-accent-pale/40 p-5 shadow-sm">
      <h2 className="text-[14.5px] font-bold">Cette session est un brouillon</h2>
      <p className="mb-4 mt-1 text-[12.5px] text-texte-doux">
        Rien ne part tant qu&apos;elle le reste : ni convocation, ni questionnaire, ni convention. Lancez son
        déroulement et l&apos;application s&apos;occupe du reste aux dates prévues — ce qui est déjà dû part
        immédiatement.
      </p>
      <form action={envoyer} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="id" value={sessionId} />
        <Bouton />
        {etat.erreur && <span className="text-[12.5px] text-danger">{etat.erreur}</span>}
        {etat.succes && <span className="text-[12.5px] font-semibold text-succes">{etat.succes}</span>}
      </form>
    </section>
  );
}
