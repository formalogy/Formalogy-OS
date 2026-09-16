"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import {
  BoutonEnvoyer,
  Champ,
  MessageErreur,
} from "@/app/(app)/_composants/formulaire";
import { creerContact, type EtatFormulaire } from "@/app/(app)/entreprises/actions";

const ETAT_INITIAL: EtatFormulaire = {};

export function FormulaireContact({ companyId }: { companyId: string }) {
  const [ouvert, setOuvert] = useState(false);
  const [etat, envoyer, enCours] = useActionState(creerContact, ETAT_INITIAL);
  const formulaire = useRef<HTMLFormElement>(null);

  // Une soumission terminée sans erreur signifie que le contact est créé :
  // on vide les champs et on referme le formulaire.
  useEffect(() => {
    if (!enCours && ouvert && etat && !etat.erreur && formulaire.current) {
      formulaire.current.reset();
    }
  }, [enCours, etat, ouvert]);

  if (!ouvert) {
    return (
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="rounded-lg border border-bordure bg-surface px-3 py-1.5 text-[12.5px] font-semibold"
      >
        Ajouter un contact
      </button>
    );
  }

  return (
    <form
      ref={formulaire}
      action={envoyer}
      className="border-t border-bordure-douce pt-4"
    >
      <input type="hidden" name="companyId" value={companyId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Champ nom="prenom" valeurParDefaut={etat.valeurs?.prenom} libelle="Prénom" obligatoire />
        <Champ nom="nom" valeurParDefaut={etat.valeurs?.nom} libelle="Nom" obligatoire />
        <Champ nom="fonction" valeurParDefaut={etat.valeurs?.fonction} libelle="Fonction" />
        <Champ nom="telephone" valeurParDefaut={etat.valeurs?.telephone} libelle="Téléphone" type="tel" />
        <div className="sm:col-span-2">
          <Champ nom="email" valeurParDefaut={etat.valeurs?.email} libelle="Email" type="email" />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <BoutonEnvoyer libelle="Ajouter" />
        <button
          type="button"
          onClick={() => setOuvert(false)}
          className="text-[12.5px] font-semibold text-texte-doux"
        >
          Annuler
        </button>
        <MessageErreur message={etat.erreur} />
      </div>
    </form>
  );
}
