"use client";

import { useActionState } from "react";

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
};

export function FormulaireFormateur({ initiales, emailVerrouille }: Props) {
  const modification = Boolean(initiales);
  const [etat, envoyer] = useActionState<EtatFormulaire, FormData>(
    modification ? modifierFormateur : creerFormateur,
    {},
  );
  const v = (nom: string) => etat.valeurs?.[nom] ?? initiales?.[nom];

  return (
    <form action={envoyer} className="max-w-3xl rounded-xl border border-bordure bg-surface p-5 shadow-sm">
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
        <Champ nom="siret" libelle="SIRET" placeholder="14 chiffres" valeurParDefaut={v("siret")} />
        <div className="sm:col-span-2">
          <Champ
            nom="specialites"
            libelle="Spécialités"
            placeholder="Ex. : Excel, Power BI, management"
            valeurParDefaut={v("specialites")}
          />
        </div>
        <Champ
          nom="tarifJournalierHT"
          libelle="Tarif journalier HT (€)"
          placeholder="450"
          valeurParDefaut={v("tarifJournalierHT")}
          aide="Information interne, jamais visible par le formateur."
        />
        <div className="sm:col-span-2">
          <ChampLong nom="notes" libelle="Notes" valeurParDefaut={v("notes")} />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <BoutonEnvoyer libelle={modification ? "Enregistrer les modifications" : "Créer le formateur"} />
        <MessageErreur message={etat.erreur} />
      </div>
    </form>
  );
}
