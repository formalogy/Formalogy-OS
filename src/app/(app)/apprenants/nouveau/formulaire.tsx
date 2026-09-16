"use client";

import { useActionState } from "react";

import {
  BoutonEnvoyer,
  Champ,
  ChampListe,
  ChampLong,
  MessageErreur,
} from "@/app/(app)/_composants/formulaire";
import { creerApprenant, type EtatFormulaire } from "@/app/(app)/apprenants/actions";
import {
  FINANCEMENTS,
  LIBELLE_FINANCEMENT,
  LIBELLE_STATUT_APPRENANT,
  STATUTS_APPRENANT,
} from "@/lib/apprenants-libelles";

const ETAT_INITIAL: EtatFormulaire = {};

const OPTIONS_STATUT = STATUTS_APPRENANT.map((valeur) => ({
  valeur,
  libelle: LIBELLE_STATUT_APPRENANT[valeur],
}));

const OPTIONS_FINANCEMENT = FINANCEMENTS.map((valeur) => ({
  valeur,
  libelle: LIBELLE_FINANCEMENT[valeur],
}));

type Props = {
  entreprises: { id: string; raisonSociale: string }[];
};

export function FormulaireApprenant({ entreprises }: Props) {
  const [etat, envoyer] = useActionState(creerApprenant, ETAT_INITIAL);

  const optionsEntreprise = [
    { valeur: "", libelle: "Aucune — particulier" },
    ...entreprises.map((e) => ({ valeur: e.id, libelle: e.raisonSociale })),
  ];

  return (
    <form
      action={envoyer}
      className="max-w-2xl rounded-xl border border-bordure bg-surface p-5 shadow-sm"
    >
      <h2 className="mb-3 text-[13px] font-bold uppercase tracking-wider text-texte-tenu">
        Identité
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Champ
          nom="prenom"
          libelle="Prénom"
          obligatoire
          valeurParDefaut={etat.valeurs?.prenom}
        />
        <Champ nom="nom" libelle="Nom" obligatoire valeurParDefaut={etat.valeurs?.nom} />
        <Champ
          nom="dateNaissance"
          libelle="Date de naissance"
          type="date"
          valeurParDefaut={etat.valeurs?.dateNaissance}
        />
        <Champ
          nom="telephone"
          libelle="Téléphone"
          type="tel"
          valeurParDefaut={etat.valeurs?.telephone}
        />
        <div className="sm:col-span-2">
          <Champ
            nom="email"
            libelle="Email"
            type="email"
            aide="Sert à l'envoi des convocations, attestations et demandes de signature."
            valeurParDefaut={etat.valeurs?.email}
          />
        </div>
        <div className="sm:col-span-2">
          <Champ nom="adresse" libelle="Adresse" valeurParDefaut={etat.valeurs?.adresse} />
        </div>
        <Champ
          nom="codePostal"
          libelle="Code postal"
          valeurParDefaut={etat.valeurs?.codePostal}
        />
        <Champ nom="ville" libelle="Ville" valeurParDefaut={etat.valeurs?.ville} />
      </div>

      <h2 className="mb-3 mt-6 text-[13px] font-bold uppercase tracking-wider text-texte-tenu">
        Administratif
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <ChampListe
            nom="companyId"
            libelle="Entreprise"
            options={optionsEntreprise}
            valeurParDefaut={etat.valeurs?.companyId ?? ""}
          />
        </div>
        <ChampListe
          nom="financement"
          libelle="Financement"
          options={OPTIONS_FINANCEMENT}
          valeurParDefaut={etat.valeurs?.financement ?? "ENTREPRISE"}
        />
        <ChampListe
          nom="statut"
          libelle="Statut"
          options={OPTIONS_STATUT}
          valeurParDefaut={etat.valeurs?.statut ?? "INSCRIT"}
        />
        <div className="sm:col-span-2">
          <ChampLong nom="notes" libelle="Notes" valeurParDefaut={etat.valeurs?.notes} />
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <BoutonEnvoyer libelle="Créer l'apprenant" />
        <MessageErreur message={etat.erreur} />
      </div>
    </form>
  );
}
