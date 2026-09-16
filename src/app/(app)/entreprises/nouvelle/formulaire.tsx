"use client";

import { useActionState } from "react";

import {
  BoutonEnvoyer,
  Champ,
  ChampLong,
  MessageErreur,
} from "@/app/(app)/_composants/formulaire";
import { creerEntreprise, type EtatFormulaire } from "@/app/(app)/entreprises/actions";

const ETAT_INITIAL: EtatFormulaire = {};

export function FormulaireEntreprise() {
  const [etat, envoyer] = useActionState(creerEntreprise, ETAT_INITIAL);

  return (
    <form
      action={envoyer}
      className="max-w-2xl rounded-xl border border-bordure bg-surface p-5 shadow-sm"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Champ nom="raisonSociale" valeurParDefaut={etat.valeurs?.raisonSociale} libelle="Raison sociale" obligatoire />
        </div>
        <Champ
          nom="siret" valeurParDefaut={etat.valeurs?.siret}
          libelle="SIRET"
          aide="14 chiffres"
          placeholder="12345678900012"
        />
        <Champ nom="telephone" valeurParDefaut={etat.valeurs?.telephone} libelle="Téléphone" type="tel" />
        <div className="sm:col-span-2">
          <Champ nom="adresse" valeurParDefaut={etat.valeurs?.adresse} libelle="Adresse" />
        </div>
        <Champ nom="codePostal" valeurParDefaut={etat.valeurs?.codePostal} libelle="Code postal" />
        <Champ nom="ville" valeurParDefaut={etat.valeurs?.ville} libelle="Ville" />
        <Champ nom="email" valeurParDefaut={etat.valeurs?.email} libelle="Email" type="email" />
        <Champ nom="siteWeb" valeurParDefaut={etat.valeurs?.siteWeb} libelle="Site web" />
        <div className="sm:col-span-2">
          <ChampLong nom="notes" libelle="Notes" valeurParDefaut={etat.valeurs?.notes} />
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <BoutonEnvoyer libelle="Créer l'entreprise" />
        <MessageErreur message={etat.erreur} />
      </div>
    </form>
  );
}
