"use client";

import { useActionState } from "react";

import { BoutonEnvoyer, MessageErreur } from "@/app/(app)/_composants/formulaire";
import { ajouterWebhook, piloterWebhook, type EtatConnexion } from "@/app/(app)/parametres/connexions/actions";

const CHAMP =
  "mt-1 w-full rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] font-normal outline-none focus:border-accent focus:ring-2 focus:ring-accent-pale";

export function FormulaireWebhook({ evenements }: { evenements: [string, string][] }) {
  const [etat, envoyer] = useActionState<EtatConnexion, FormData>(ajouterWebhook, {});
  return (
    <form action={envoyer} className="flex flex-col gap-3">
      <label className="text-[12.5px] font-semibold">
        Nom
        <input name="nom" placeholder="Tableau des inscriptions" className={CHAMP} />
      </label>
      <label className="text-[12.5px] font-semibold">
        Adresse du webhook Make
        <input name="url" placeholder="https://hook.eu2.make.com/…" className={`${CHAMP} font-mono`} />
      </label>
      <fieldset>
        <legend className="text-[12.5px] font-semibold">Événements envoyés</legend>
        <div className="mt-1 grid gap-1.5 sm:grid-cols-2">
          {evenements.map(([code, libelle]) => (
            <label key={code} className="flex items-center gap-2 text-[12.5px]">
              <input type="checkbox" name="evenements" value={code} /> {libelle}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <BoutonEnvoyer libelle="Ajouter la connexion" />
        <MessageErreur message={etat.erreur} />
        {etat.succes && <span className="text-[12.5px] font-semibold text-succes">{etat.succes}</span>}
      </div>
    </form>
  );
}

export function ActionsWebhook({ id, actif }: { id: string; actif: boolean }) {
  const [etat, agir] = useActionState<EtatConnexion, FormData>((_p, d) => piloterWebhook(d), {});
  const bouton = "rounded-lg border border-bordure bg-surface px-3 py-1.5 text-[12px] font-semibold";
  return (
    <form action={agir} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <button name="operation" value="essai" className={bouton}>Envoyer une ligne d&apos;essai</button>
      <button name="operation" value="basculer" className={bouton}>{actif ? "Désactiver" : "Activer"}</button>
      <button
        name="operation"
        value="supprimer"
        className={`${bouton} text-danger`}
        onClick={(e) => {
          if (!window.confirm("Supprimer cette connexion ? Make ne recevra plus rien.")) e.preventDefault();
        }}
      >
        Supprimer
      </button>
      {etat.erreur && <span className="text-[12px] text-danger">{etat.erreur}</span>}
      {etat.succes && <span className="text-[12px] font-semibold text-succes">{etat.succes}</span>}
    </form>
  );
}
