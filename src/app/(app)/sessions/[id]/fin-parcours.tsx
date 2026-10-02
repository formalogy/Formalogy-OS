"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { validerFinParcours, type EtatFinParcours } from "@/app/(app)/sessions/actions";

const jour = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });

function Valider() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rounded-lg bg-accent px-3 py-1 text-[12px] font-semibold text-white disabled:opacity-60">
      {pending ? "Validation…" : "Parcours terminé (100 %)"}
    </button>
  );
}

/// Session en ligne : le stagiaire sort de formation dès qu'il a atteint
/// 100 % sur la plateforme — attestation, certificat, puis facture.
export function FinParcours({ sessionId, learnerId, termineLe }: { sessionId: string; learnerId: string; termineLe: string | null }) {
  const [etat, valider] = useActionState<EtatFinParcours, FormData>(validerFinParcours, {});

  if (termineLe) {
    return (
      <div className="mt-1 text-[11.5px] font-semibold text-succes">
        Parcours terminé le {jour.format(new Date(termineLe))}
        {etat.succes && <span className="block font-normal text-texte-doux">{etat.succes}</span>}
      </div>
    );
  }
  return (
    <form
      action={valider}
      onSubmit={(e) => {
        if (!window.confirm("Valider la fin de son parcours (100 %) ? Son attestation et son certificat lui seront envoyés aussitôt.")) e.preventDefault();
      }}
      className="mt-1.5 flex flex-wrap items-center gap-2"
    >
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="learnerId" value={learnerId} />
      <select name="resultat" defaultValue="ACQUIS" aria-label="Évaluation des acquis" className="rounded-lg border border-bordure bg-surface px-2 py-1 text-[12px]">
        <option value="ACQUIS">Acquis</option>
        <option value="PARTIELLEMENT_ACQUIS">Partiellement acquis</option>
        <option value="NON_ACQUIS">Non acquis</option>
      </select>
      <Valider />
      {etat.erreur && <span className="text-[12px] text-danger">{etat.erreur}</span>}
    </form>
  );
}
