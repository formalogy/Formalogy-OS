"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { fermerAccesFormateur, ouvrirAccesFormateur, type EtatAcces } from "@/app/(app)/formateurs/actions";

function Bouton({ libelle }: { libelle: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-60">
      {pending ? "…" : libelle}
    </button>
  );
}

type Props = {
  trainerId: string;
  /// null : aucun compte ; sinon l'état du compte lié
  compte: { email: string; actif: boolean; derniereConnexion: string | null } | null;
  ficheActive: boolean;
};

export function AccesFormateur({ trainerId, compte, ficheActive }: Props) {
  const [etat, ouvrir] = useActionState<EtatAcces, FormData>(ouvrirAccesFormateur, {});

  return (
    <div className="flex flex-col gap-3">
      {etat.motDePasse && (
        <div role="status" className="rounded-lg border border-succes/40 bg-succes/12 p-3 text-[12.5px]">
          <p className="font-semibold text-succes">Accès prêt. Transmettez ces informations au formateur :</p>
          <dl className="mt-2 grid gap-1">
            <div className="flex gap-2"><dt className="w-28 text-texte-tenu">Adresse</dt><dd className="font-mono">{typeof window === "undefined" ? "" : window.location.origin}</dd></div>
            <div className="flex gap-2"><dt className="w-28 text-texte-tenu">Identifiant</dt><dd className="font-mono">{etat.email}</dd></div>
            <div className="flex gap-2"><dt className="w-28 text-texte-tenu">Mot de passe</dt><dd className="select-all font-mono font-semibold">{etat.motDePasse}</dd></div>
          </dl>
          <p className="mt-2 text-[11.5px] text-texte-doux">
            Ce mot de passe ne sera plus jamais affiché. Le formateur pourra le changer depuis « Mon compte ».
          </p>
        </div>
      )}

      {compte?.actif ? (
        <>
          <p className="text-[12.8px]">
            <span className="font-semibold text-succes">Accès ouvert</span> — identifiant {compte.email}
            <br />
            <span className="text-[11.5px] text-texte-tenu">
              {compte.derniereConnexion ? `Dernière connexion : ${compte.derniereConnexion}` : "Pas encore connecté."}
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            <form action={ouvrir}>
              <input type="hidden" name="id" value={trainerId} />
              <Bouton libelle="Générer un nouveau mot de passe" />
            </form>
            <form action={fermerAccesFormateur}>
              <input type="hidden" name="id" value={trainerId} />
              <button type="submit" className="rounded-lg border border-bordure bg-surface px-3 py-1.5 text-[12.5px] font-semibold text-danger">
                Fermer l&apos;accès
              </button>
            </form>
          </div>
        </>
      ) : (
        <>
          <p className="text-[12.8px] text-texte-doux">
            {compte ? "Accès fermé." : "Aucun accès."} Avec un accès, le formateur voit uniquement ses sessions :
            dates, lieu, liste des apprenants et documents utiles. Il ne voit ni les prix, ni les autres sessions.
          </p>
          {ficheActive ? (
            <form action={ouvrir}>
              <input type="hidden" name="id" value={trainerId} />
              <Bouton libelle={compte ? "Rouvrir l'accès" : "Ouvrir un accès"} />
            </form>
          ) : (
            <p className="text-[12px] text-texte-tenu">Fiche inactive : réactivez-la pour ouvrir un accès.</p>
          )}
        </>
      )}

      {etat.erreur && <p role="alert" className="rounded-lg bg-danger-pale px-3 py-2 text-[12.5px] text-danger">{etat.erreur}</p>}
    </div>
  );
}
