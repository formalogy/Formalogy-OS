"use client";

import { useActionState, useState } from "react";

import {
  BoutonEnvoyer,
  Champ,
  ChampListe,
  ChampLong,
  MessageErreur,
} from "@/app/(app)/_composants/formulaire";
import { creerFormateur, modifierFormateur, type EtatFormulaire } from "@/app/(app)/formateurs/actions";

const STATUTS = [
  { valeur: "INDEPENDANT", libelle: "Indépendant" },
  { valeur: "SALARIE", libelle: "Salarié" },
  { valeur: "SOUS_TRAITANT", libelle: "Sous-traitant" },
];

type Props = {
  /// Valeurs actuelles, en mode modification
  initiales?: Record<string, string> & { id: string };
  /// L'email sert d'identifiant quand un accès est ouvert
  emailVerrouille?: boolean;
  /// Création par un administrateur : proposer de verrouiller le profil
  proposerVerrou?: boolean;
};

export function FormulaireFormateur({ initiales, emailVerrouille, proposerVerrou }: Props) {
  const modification = Boolean(initiales);
  const [etat, envoyer] = useActionState<EtatFormulaire, FormData>(
    modification ? modifierFormateur : creerFormateur,
    {},
  );
  const v = (nom: string) => etat.valeurs?.[nom] ?? initiales?.[nom];
  const [modalite, setModalite] = useState(v("modalite") ?? "");
  const [typeLieu, setTypeLieu] = useState(v("typeLieu") ?? "ADRESSE");

  return (
    <form
      action={envoyer}
      onChange={(e) => {
        const champ = e.target as unknown as HTMLSelectElement;
        if (champ.name === "modalite") setModalite(champ.value);
        if (champ.name === "typeLieu") setTypeLieu(champ.value);
      }}
      className="max-w-3xl rounded-xl border border-bordure bg-surface p-5 shadow-sm">
      {initiales && <input type="hidden" name="id" value={initiales.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <Champ nom="prenom" libelle="Prénom" obligatoire valeurParDefaut={v("prenom")} />
        <Champ nom="nom" libelle="Nom" obligatoire valeurParDefaut={v("nom")} />
        <Champ
          nom="email"
          libelle="Email"
          type="email"
          valeurParDefaut={v("email")}
          aide={emailVerrouille ? "Identifiant de connexion du formateur : non modifiable tant que son accès est ouvert." : "Nécessaire pour lui ouvrir un accès à l'application."}
        />
        <Champ nom="telephone" libelle="Téléphone" valeurParDefaut={v("telephone")} />
        <ChampListe nom="statut" libelle="Statut" options={STATUTS} valeurParDefaut={v("statut") ?? "INDEPENDANT"} />
        <ChampListe
          nom="modalite"
          libelle="Travaille habituellement en"
          options={[
            { valeur: "", libelle: "Non précisé" },
            { valeur: "PRESENTIEL", libelle: "Présentiel" },
            { valeur: "DISTANCIEL", libelle: "Distanciel (visio)" },
          ]}
          valeurParDefaut={v("modalite") ?? ""}
        />
        {modalite === "PRESENTIEL" && (
          <ChampListe
            nom="typeLieu"
            libelle="Lieu de formation"
            options={[
              { valeur: "ADRESSE", libelle: "Une adresse précise" },
              { valeur: "ENTREPRISE", libelle: "Au sein de l'entreprise cliente" },
            ]}
            valeurParDefaut={v("typeLieu") ?? "ADRESSE"}
          />
        )}
        {modalite === "PRESENTIEL" && typeLieu === "ADRESSE" && (
          <div className="sm:col-span-2">
            <Champ nom="lieu" libelle="Adresse de formation" placeholder="Adresse où se déroulent ses formations" valeurParDefaut={v("lieu")} />
          </div>
        )}
        {modalite === "PRESENTIEL" && typeLieu === "ENTREPRISE" && (
          <p className="self-end text-[11.5px] text-texte-tenu">
            Le lieu de ses sessions sera l&apos;adresse de la fiche de l&apos;entreprise cliente.
          </p>
        )}
        <Champ nom="siret" libelle="SIRET" placeholder="14 chiffres" valeurParDefaut={v("siret")} />
        <Champ
          nom="numeroDeclaration"
          libelle="Numéro de déclaration d'activité"
          placeholder="Ex. : 11 75 12345 75"
          valeurParDefaut={v("numeroDeclaration")}
        />
        <div className="sm:col-span-2">
          <Champ
            nom="specialites"
            libelle="Spécialités"
            placeholder="Ex. : Excel, Power BI, management"
            valeurParDefaut={v("specialites")}
          />
        </div>
        <Champ
          nom="tauxCommissionnement"
          libelle="Taux de commissionnement (%)"
          placeholder="15"
          valeurParDefaut={v("tauxCommissionnement")}
          aide="Information interne, jamais visible par le formateur."
        />
        <div className="sm:col-span-2">
          <ChampLong nom="notes" libelle="Notes" valeurParDefaut={v("notes")} />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {proposerVerrou && (
          <label className="flex w-full items-center gap-2 text-[12.5px] font-semibold">
            <input type="checkbox" name="verrouille" />
            Verrouiller le profil après création (plus aucune modification sans déverrouillage par un administrateur)
          </label>
        )}
        <BoutonEnvoyer libelle={modification ? "Enregistrer les modifications" : "Créer le formateur"} />
        <MessageErreur message={etat.erreur} />
      </div>
    </form>
  );
}
