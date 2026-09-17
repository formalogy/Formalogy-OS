"use client";

import { useState } from "react";

import { authClient } from "@/lib/auth-client";

const CHAMP =
  "mt-1.5 w-full rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] font-normal outline-none focus:border-accent focus:ring-2 focus:ring-accent-pale";

export function ChangementMotDePasse() {
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string>();
  const [succes, setSucces] = useState(false);

  async function envoyer(formulaire: HTMLFormElement) {
    const donnees = new FormData(formulaire);
    const actuel = String(donnees.get("actuel") ?? "");
    const nouveau = String(donnees.get("nouveau") ?? "");
    const confirmation = String(donnees.get("confirmation") ?? "");

    setErreur(undefined);
    setSucces(false);
    if (nouveau.length < 12) return setErreur("Le nouveau mot de passe doit comporter au moins 12 caractères.");
    if (nouveau !== confirmation) return setErreur("Les deux saisies du nouveau mot de passe ne correspondent pas.");
    if (nouveau === actuel) return setErreur("Le nouveau mot de passe doit être différent de l'actuel.");

    setEnCours(true);
    // Vérifié côté serveur par better-auth : l'ancien mot de passe est exigé,
    // et les autres appareils connectés sont déconnectés.
    const { error } = await authClient.changePassword({
      currentPassword: actuel,
      newPassword: nouveau,
      revokeOtherSessions: true,
    });
    setEnCours(false);

    if (error) {
      setErreur(error.code === "INVALID_PASSWORD" ? "Le mot de passe actuel est incorrect." : "Le changement a échoué. Réessayez.");
      return;
    }
    formulaire.reset();
    setSucces(true);
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void envoyer(e.currentTarget);
      }}
      className="max-w-md rounded-xl border border-bordure bg-surface p-5 shadow-sm"
    >
      <h2 className="mb-3 text-[14.5px] font-bold">Changer mon mot de passe</h2>
      <div className="flex flex-col gap-4">
        <label className="block text-[12.5px] font-semibold">
          Mot de passe actuel
          <input name="actuel" type="password" required autoComplete="current-password" className={CHAMP} />
        </label>
        <label className="block text-[12.5px] font-semibold">
          Nouveau mot de passe <span className="font-normal text-texte-tenu">(12 caractères minimum)</span>
          <input name="nouveau" type="password" required minLength={12} autoComplete="new-password" className={CHAMP} />
        </label>
        <label className="block text-[12.5px] font-semibold">
          Confirmer le nouveau mot de passe
          <input name="confirmation" type="password" required minLength={12} autoComplete="new-password" className={CHAMP} />
        </label>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={enCours} className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60">
          {enCours ? "Enregistrement…" : "Changer le mot de passe"}
        </button>
        {succes && <span className="text-[12.5px] font-semibold text-succes">Mot de passe changé.</span>}
      </div>
      {erreur && <p role="alert" className="mt-3 rounded-lg bg-danger-pale px-3 py-2 text-[12.5px] text-danger">{erreur}</p>}
    </form>
  );
}
