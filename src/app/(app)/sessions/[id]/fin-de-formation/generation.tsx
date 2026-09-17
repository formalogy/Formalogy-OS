"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { genererAttestations, type EtatGeneration } from "@/app/(app)/fin-de-formation/actions";

function Bouton({ desactive }: { desactive: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={desactive || pending} className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50">
      {pending ? "Génération…" : "Générer les attestations et certificats"}
    </button>
  );
}

export function GenerationAttestations({ sessionId, desactive }: { sessionId: string; desactive: boolean }) {
  const [etat, generer] = useActionState<EtatGeneration, FormData>(genererAttestations, {});
  return (
    <form action={generer} className="flex flex-col items-end gap-1">
      <input type="hidden" name="sessionId" value={sessionId} />
      <Bouton desactive={desactive} />
      {etat.succes && <p className="text-[12px] font-semibold text-succes">{etat.succes}</p>}
      {etat.ignores && etat.ignores.length > 0 && (
        <p className="max-w-md text-right text-[12px] text-alerte">Non générés : {etat.ignores.join(" ; ")}.</p>
      )}
      {etat.erreur && <p role="alert" className="max-w-md text-right text-[12px] text-danger">{etat.erreur}</p>}
    </form>
  );
}
