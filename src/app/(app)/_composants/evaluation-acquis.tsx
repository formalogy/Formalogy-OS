"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { enregistrerEvaluation, type EtatEvaluation } from "@/app/(app)/fin-de-formation/actions";

const RESULTATS = [
  { valeur: "ACQUIS", libelle: "Acquis" },
  { valeur: "PARTIELLEMENT_ACQUIS", libelle: "Partiellement acquis" },
  { valeur: "NON_ACQUIS", libelle: "Non acquis" },
];

function Bouton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="shrink-0 rounded-lg border border-bordure bg-surface px-2.5 py-1.5 text-[12px] font-semibold disabled:opacity-60">
      {pending ? "…" : "Enregistrer"}
    </button>
  );
}

/// Saisie de l'évaluation des acquis d'un apprenant.
export function EvaluationAcquis(props: {
  sessionId: string;
  learnerId: string;
  resultat?: string;
  commentaire?: string | null;
  modifiable: boolean;
}) {
  const [etat, envoyer] = useActionState<EtatEvaluation, FormData>(enregistrerEvaluation, {});
  const champ = "rounded-lg border border-bordure bg-surface px-2 py-1.5 text-[12.5px] outline-none focus:border-accent disabled:bg-surface-creuse";

  return (
    <form action={envoyer} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="sessionId" value={props.sessionId} />
      <input type="hidden" name="learnerId" value={props.learnerId} />
      <select key={props.resultat} name="resultat" defaultValue={props.resultat ?? ""} disabled={!props.modifiable} aria-label="Résultat" className={champ}>
        <option value="">Résultat…</option>
        {RESULTATS.map((r) => (
          <option key={r.valeur} value={r.valeur}>{r.libelle}</option>
        ))}
      </select>
      <input
        name="commentaire"
        defaultValue={props.commentaire ?? ""}
        disabled={!props.modifiable}
        placeholder="Commentaire (facultatif, repris sur l'attestation)"
        aria-label="Commentaire"
        className={`${champ} min-w-[220px] flex-1`}
      />
      {props.modifiable && <Bouton />}
      {etat.succes && <span className="text-[12px] font-semibold text-succes">✓</span>}
      {etat.erreur && <span role="alert" className="text-[12px] text-danger">{etat.erreur}</span>}
    </form>
  );
}
