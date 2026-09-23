"use client";

import { useActionState } from "react";

import {
  BoutonEnvoyer,
  Champ,
  ChampListe,
  ChampLong,
  MessageErreur,
} from "@/app/(app)/_composants/formulaire";
import { creerApprenant, modifierApprenant, type EtatFormulaire } from "@/app/(app)/apprenants/actions";
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
  /// Valeurs actuelles, en mode modification
  initiales?: Record<string, string> & { id: string };
};

export function FormulaireApprenant({ entreprises, initiales }: Props) {
  const modification = Boolean(initiales);
  const [etat, envoyer] = useActionState(modification ? modifierApprenant : creerApprenant, ETAT_INITIAL);
  const v = (nom: string) => etat.valeurs?.[nom] ?? initiales?.[nom];

  const optionsEntreprise = [
    { valeur: "", libelle: "Aucune — particulier" },
    ...entreprises.map((e) => ({ valeur: e.id, libelle: e.raisonSociale })),
  ];

  return (
    <form
      action={envoyer}
      className="max-w-2xl rounded-xl border border-bordure bg-surface p-5 shadow-sm"
    >
      {initiales && <input type="hidden" name="id" value={initiales.id} />}

      <h2 className="mb-3 text-[13px] font-bold uppercase tracking-wider text-texte-tenu">
        Identité
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Champ nom="prenom" libelle="Prénom" obligatoire valeurParDefaut={v("prenom")} />
        <Champ nom="nom" libelle="Nom" obligatoire valeurParDefaut={v("nom")} />
        <Champ nom="dateNaissance" libelle="Date de naissance" type="date" valeurParDefaut={v("dateNaissance")} />
        <Champ nom="telephone" libelle="Téléphone" type="tel" valeurParDefaut={v("telephone")} />
        <div className="sm:col-span-2">
          <Champ
            nom="email"
            libelle="Email"
            type="email"
            aide="Sert à l'envoi des convocations, attestations et demandes de signature."
            valeurParDefaut={v("email")}
          />
        </div>
        <div className="sm:col-span-2">
          <Champ nom="adresse" libelle="Adresse" valeurParDefaut={v("adresse")} />
        </div>
        <Champ nom="codePostal" libelle="Code postal" valeurParDefaut={v("codePostal")} />
        <Champ nom="ville" libelle="Ville" valeurParDefaut={v("ville")} />
        <div className="sm:col-span-2">
          <Champ
            nom="niveauEtudes"
            libelle="Niveau d'études / diplôme"
            placeholder="Ex. : Bac+3 — licence de gestion"
            valeurParDefaut={v("niveauEtudes")}
          />
        </div>
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
            valeurParDefaut={v("companyId") ?? ""}
          />
        </div>
        <ChampListe
          nom="financement"
          libelle="Financement"
          options={OPTIONS_FINANCEMENT}
          valeurParDefaut={v("financement") ?? "ENTREPRISE"}
        />
        <ChampListe
          nom="statut"
          libelle="Statut"
          options={OPTIONS_STATUT}
          valeurParDefaut={v("statut") ?? "INSCRIT"}
        />
        <Champ
          nom="numeroDossierCpf"
          libelle="Numéro de dossier CPF"
          aide="Pour un financement personnel via moncompteformation.gouv.fr."
          valeurParDefaut={v("numeroDossierCpf")}
        />
        <div className="sm:col-span-2">
          <ChampLong nom="notes" libelle="Notes" valeurParDefaut={v("notes")} />
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <BoutonEnvoyer libelle={modification ? "Enregistrer les modifications" : "Créer l'apprenant"} />
        <MessageErreur message={etat.erreur} />
      </div>
    </form>
  );
}
