"use client";

import { useActionState, useEffect, useRef } from "react";

import { BoutonEnvoyer, MessageErreur } from "@/app/(app)/_composants/formulaire";
import { creerTache, type EtatFormulaire } from "@/app/(app)/taches/actions";

export function FormulaireTache() {
  const [etat, envoyer, enCours] = useActionState<EtatFormulaire, FormData>(creerTache, {});
  const formulaire = useRef<HTMLFormElement>(null);

  // Tâche créée sans erreur : on vide le champ pour la suivante.
  useEffect(() => {
    if (!enCours && !etat.erreur) formulaire.current?.reset();
  }, [enCours, etat]);

  return (
    <form ref={formulaire} action={envoyer} className="flex flex-wrap items-end gap-2 rounded-xl border border-bordure bg-surface p-3 shadow-sm">
      <label className="min-w-[220px] flex-1 text-[12px] font-semibold">
        Nouvelle tâche
        <input name="titre" defaultValue={etat.valeurs?.titre} placeholder="Ex. : rappeler l'OPCO pour le dossier Meriva" className="mt-1 w-full rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] font-normal outline-none focus:border-accent focus:ring-2 focus:ring-accent-pale" />
      </label>
      <label className="text-[12px] font-semibold">
        Échéance
        <input type="date" name="echeance" defaultValue={etat.valeurs?.echeance} className="mt-1 block rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] font-normal outline-none focus:border-accent" />
      </label>
      <label className="text-[12px] font-semibold">
        Priorité
        <select key={etat.valeurs?.priorite} name="priorite" defaultValue={etat.valeurs?.priorite ?? "NORMALE"} className="mt-1 block rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] font-normal outline-none focus:border-accent">
          <option value="BASSE">Basse</option>
          <option value="NORMALE">Normale</option>
          <option value="HAUTE">Haute</option>
        </select>
      </label>
      <BoutonEnvoyer libelle="Ajouter" />
      <div className="w-full">
        <MessageErreur message={etat.erreur} />
      </div>
    </form>
  );
}
