"use client";

import { useState, useTransition } from "react";

import { anonymiserFicheApprenant } from "@/app/(app)/apprenants/actions";

export function ActionsRgpd({ id, nomComplet }: { id: string; nomComplet: string }) {
  const [confirmation, setConfirmation] = useState(false);
  const [erreur, setErreur] = useState<string>();
  const [enCours, demarrer] = useTransition();

  const anonymiser = () => {
    setErreur(undefined);
    const donnees = new FormData();
    donnees.set("id", id);
    demarrer(async () => {
      const r = await anonymiserFicheApprenant(donnees);
      if (r?.erreur) setErreur(r.erreur);
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <a href={`/api/apprenants/${id}/export-rgpd`} className="rounded-lg border border-bordure bg-surface px-3 py-1.5 text-[12.5px] font-semibold">
          Exporter ses données
        </a>
        {!confirmation ? (
          <button type="button" onClick={() => setConfirmation(true)} className="rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-danger hover:bg-danger-pale">
            Anonymiser (droit à l&apos;effacement)
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-danger-pale px-3 py-1.5">
            <span className="text-[12.5px] text-danger">
              Confirmer : le nom, l&apos;email, le téléphone et l&apos;adresse de {nomComplet} seront remplacés
              définitivement. Irréversible.
            </span>
            <button type="button" disabled={enCours} onClick={anonymiser} className="rounded-lg bg-danger px-2.5 py-1 text-[12px] font-semibold text-white disabled:opacity-60">
              {enCours ? "…" : "Confirmer"}
            </button>
            <button type="button" onClick={() => setConfirmation(false)} className="text-[12px] font-semibold text-texte-doux">
              Annuler
            </button>
          </div>
        )}
      </div>
      {erreur && <p role="alert" className="text-[12px] text-danger">{erreur}</p>}
    </div>
  );
}
