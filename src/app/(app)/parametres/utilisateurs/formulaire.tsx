"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { creerUtilisateur, type EtatAcces } from "@/app/(app)/parametres/utilisateurs/actions";

function Bouton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60">
      {pending ? "Création…" : "Créer le compte"}
    </button>
  );
}

/// Une fois affiché, le mot de passe provisoire disparaît si on ferme le
/// formulaire ou qu'on en recrée un autre : Henrri, BoldSign et les
/// formateurs suivent la même règle, il ne s'affiche qu'une fois.
export function FormulaireUtilisateur() {
  const [ouvert, setOuvert] = useState(false);
  const [etat, envoyer] = useActionState<EtatAcces, FormData>(creerUtilisateur, {});

  if (!ouvert) {
    return (
      <button type="button" onClick={() => setOuvert(true)} className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white">
        Créer un compte
      </button>
    );
  }

  if (etat.motDePasse) {
    return (
      <div role="status" className="max-w-lg rounded-xl border border-succes/40 bg-succes/12 p-4 text-[12.5px]">
        <p className="font-semibold text-succes">Compte créé. Transmettez ces informations à la personne concernée :</p>
        <dl className="mt-2 grid gap-1">
          <div className="flex gap-2">
            <dt className="w-28 text-texte-tenu">Identifiant</dt>
            <dd className="font-mono">{etat.email}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-28 text-texte-tenu">Mot de passe</dt>
            <dd className="select-all font-mono font-semibold">{etat.motDePasse}</dd>
          </div>
        </dl>
        <p className="mt-2 text-[11.5px] text-texte-doux">
          Ce mot de passe ne sera plus jamais affiché. La personne pourra le changer depuis « Mon compte ».
        </p>
        <button type="button" onClick={() => setOuvert(false)} className="mt-3 rounded-lg border border-bordure bg-surface px-3 py-1.5 text-[12px] font-semibold">
          Fermer
        </button>
      </div>
    );
  }

  return (
    <form action={envoyer} className="max-w-lg rounded-xl border border-bordure bg-surface p-4 shadow-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-[12.5px] font-semibold sm:col-span-2">
          Nom
          <input name="nom" required defaultValue={etat.valeurs?.nom} placeholder="Prénom Nom" className="mt-1 w-full rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] font-normal outline-none focus:border-accent focus:ring-2 focus:ring-accent-pale" />
        </label>
        <label className="text-[12.5px] font-semibold sm:col-span-2">
          Email
          <input name="email" type="email" required defaultValue={etat.valeurs?.email} placeholder="prenom.nom@formalogy.fr" className="mt-1 w-full rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] font-normal outline-none focus:border-accent focus:ring-2 focus:ring-accent-pale" />
        </label>
        <label className="text-[12.5px] font-semibold">
          Rôle
          <select name="role" defaultValue={etat.valeurs?.role ?? "GESTIONNAIRE"} className="mt-1 w-full rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent">
            <option value="GESTIONNAIRE">Gestionnaire</option>
            <option value="ADMIN">Administrateur</option>
          </select>
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Bouton />
        <button type="button" onClick={() => setOuvert(false)} className="text-[12.5px] font-semibold text-texte-doux">Annuler</button>
        {etat.erreur && <span role="alert" className="text-[12.5px] text-danger">{etat.erreur}</span>}
      </div>
    </form>
  );
}
