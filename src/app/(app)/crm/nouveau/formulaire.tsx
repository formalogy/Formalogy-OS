"use client";

import { useActionState } from "react";

import {
  BoutonEnvoyer,
  Champ,
  ChampListe,
  ChampLong,
  MessageErreur,
} from "@/app/(app)/_composants/formulaire";
import { creerProspect, type EtatFormulaire } from "@/app/(app)/crm/actions";
import {
  LIBELLE_SOURCE,
  LIBELLE_STATUT,
  SOURCES_ORDONNEES,
  STATUTS_ORDONNES,
} from "@/lib/crm-libelles";

const ETAT_INITIAL: EtatFormulaire = {};

const OPTIONS_SOURCE = SOURCES_ORDONNEES.map((valeur) => ({
  valeur,
  libelle: LIBELLE_SOURCE[valeur],
}));

const OPTIONS_STATUT = STATUTS_ORDONNES.map((valeur) => ({
  valeur,
  libelle: LIBELLE_STATUT[valeur],
}));

export function FormulaireProspect() {
  const [etat, envoyer] = useActionState(creerProspect, ETAT_INITIAL);

  return (
    <form
      action={envoyer}
      className="max-w-2xl rounded-xl border border-bordure bg-surface p-5 shadow-sm"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Champ nom="prenom" valeurParDefaut={etat.valeurs?.prenom} libelle="Prénom" obligatoire />
        <Champ nom="nom" valeurParDefaut={etat.valeurs?.nom} libelle="Nom" obligatoire />
        <div className="sm:col-span-2">
          <Champ
            nom="entreprise" valeurParDefaut={etat.valeurs?.entreprise}
            libelle="Entreprise"
            aide="Saisie libre — le rattachement à une fiche entreprise viendra plus tard."
          />
        </div>
        <Champ nom="email" valeurParDefaut={etat.valeurs?.email} libelle="Email" type="email" />
        <Champ nom="telephone" valeurParDefaut={etat.valeurs?.telephone} libelle="Téléphone" type="tel" />
        <ChampListe
          nom="source"
          libelle="Source"
          options={OPTIONS_SOURCE}
          valeurParDefaut={etat.valeurs?.source ?? "AUTRE"}
        />
        <ChampListe
          nom="statut"
          libelle="Statut"
          options={OPTIONS_STATUT}
          valeurParDefaut={etat.valeurs?.statut ?? "NOUVEAU"}
        />
        <Champ
          nom="montantPotentiel" valeurParDefaut={etat.valeurs?.montantPotentiel}
          libelle="Montant potentiel"
          aide="En euros, sans symbole"
          placeholder="2400"
        />
        <Champ nom="prochaineRelance" valeurParDefaut={etat.valeurs?.prochaineRelance} libelle="Prochaine relance" type="date" />
        <div className="sm:col-span-2">
          <ChampLong nom="notes" libelle="Notes" valeurParDefaut={etat.valeurs?.notes} />
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <BoutonEnvoyer libelle="Créer le prospect" />
        <MessageErreur message={etat.erreur} />
      </div>
    </form>
  );
}
