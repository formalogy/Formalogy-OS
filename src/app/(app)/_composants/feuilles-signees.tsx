"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { deposerFeuilleSignee, type EtatDepotFeuille } from "@/app/(app)/emargements/actions";

export type JourFeuille = {
  /// « 2026-09-28 »
  cle: string;
  libelle: string;
  passe: boolean;
  feuille: { recue: string; parEmail: boolean; documentId: string } | null;
};

function BoutonDepot() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rounded-md bg-accent px-2.5 py-1 text-[12px] font-semibold text-white disabled:opacity-60">
      {pending ? "Envoi…" : "Déposer"}
    </button>
  );
}

function LigneJour({ sessionId, jour, lienDocument }: { sessionId: string; jour: JourFeuille; lienDocument: boolean }) {
  const [etat, deposer] = useActionState<EtatDepotFeuille, FormData>(deposerFeuilleSignee, {});
  const [remplacer, setRemplacer] = useState(false);
  const afficherDepot = jour.passe && (!jour.feuille || remplacer);

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-bordure-douce py-2.5 first:border-t-0">
      <span className="w-40 shrink-0 text-[13px] font-semibold">{jour.libelle}</span>
      {jour.feuille ? (
        <span className="text-[12.5px] text-succes">
          ✓ {jour.feuille.parEmail ? "Reçue par email" : "Déposée"} le {jour.feuille.recue}
          {lienDocument && (
            <Link href={`/documents/${jour.feuille.documentId}`} className="ml-2 font-semibold text-accent-fort hover:underline">
              Voir
            </Link>
          )}
          {!remplacer && (
            <button type="button" onClick={() => setRemplacer(true)} className="ml-2 font-semibold text-texte-tenu hover:underline">
              Remplacer
            </button>
          )}
        </span>
      ) : jour.passe ? (
        <span className="text-[12.5px] font-semibold text-alerte">Manquante</span>
      ) : (
        <span className="text-[12.5px] text-texte-tenu">à venir</span>
      )}
      {afficherDepot && (
        <form action={deposer} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="sessionId" value={sessionId} />
          <input type="hidden" name="jour" value={jour.cle} />
          <input
            type="file"
            name="fichier"
            required
            accept="application/pdf,image/jpeg,image/png"
            aria-label={`Feuille signée du ${jour.libelle}`}
            className="max-w-56 text-[12px] file:mr-2 file:rounded-md file:border file:border-bordure file:bg-surface file:px-2 file:py-1 file:text-[12px]"
          />
          <BoutonDepot />
        </form>
      )}
      {etat.erreur && <span className="basis-full text-[12px] text-danger">{etat.erreur}</span>}
    </li>
  );
}

/// Feuilles d'émargement signées, jour par jour (A-05) : celles renvoyées par
/// le formateur en réponse à l'email du matin se rangent seules ; les autres
/// se déposent ici. Tant qu'une feuille manque, le formateur est relancé.
export function FeuillesSignees({ sessionId, jours, lienDocument }: { sessionId: string; jours: JourFeuille[]; lienDocument: boolean }) {
  return (
    <ul className="px-4 py-1">
      {jours.map((jour) => (
        <LigneJour key={jour.cle} sessionId={sessionId} jour={jour} lienDocument={lienDocument} />
      ))}
    </ul>
  );
}
