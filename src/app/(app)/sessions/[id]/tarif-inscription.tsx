"use client";

import { useActionState, useState } from "react";

import { modifierTarifInscription, type EtatFormulaire } from "@/app/(app)/sessions/actions";
import { formaterEuros } from "@/lib/crm-libelles";

/// Tarif HT d'un apprenant inscrit, corrigeable tant que sa facture
/// personnelle n'est pas émise.
export function TarifInscription({
  sessionId,
  learnerId,
  prix,
  modifiable,
}: {
  sessionId: string;
  learnerId: string;
  prix: string | null;
  modifiable: boolean;
}) {
  const [edition, setEdition] = useState(false);
  const [etat, envoyer, enCours] = useActionState<EtatFormulaire, FormData>(modifierTarifInscription, {});

  // Une correction enregistrée referme la saisie.
  const [etatVu, setEtatVu] = useState(etat);
  if (etat !== etatVu) {
    setEtatVu(etat);
    if (!etat.erreur) setEdition(false);
  }

  if (!edition) {
    return (
      <span className="whitespace-nowrap text-[12px]">
        <span className={prix === null ? "font-semibold text-alerte" : "font-mono tabular-nums text-texte-doux"}>
          {prix === null ? "tarif à indiquer" : `${formaterEuros(prix)} HT`}
        </span>
        {modifiable && (
          <button type="button" onClick={() => setEdition(true)} className="ml-1.5 font-semibold text-accent-fort hover:underline">
            modifier
          </button>
        )}
      </span>
    );
  }

  return (
    <form action={envoyer} className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="learnerId" value={learnerId} />
      <input
        name="prixHT"
        inputMode="decimal"
        defaultValue={prix?.replace(".", ",") ?? ""}
        aria-label="Tarif HT de l'apprenant"
        autoFocus
        className="w-24 rounded-md border border-bordure bg-surface px-2 py-1 text-right font-mono text-[12px] outline-none focus:border-accent focus:ring-2 focus:ring-accent-pale"
      />
      <span className="text-[12px] text-texte-tenu">€ HT</span>
      <button type="submit" disabled={enCours} className="rounded-md bg-accent px-2 py-1 text-[11.5px] font-semibold text-white disabled:opacity-60">
        {enCours ? "…" : "OK"}
      </button>
      <button type="button" onClick={() => setEdition(false)} className="text-[11.5px] font-semibold text-texte-tenu hover:underline">
        Annuler
      </button>
      {etat.erreur && <span className="basis-full text-[11.5px] text-danger">{etat.erreur}</span>}
    </form>
  );
}
