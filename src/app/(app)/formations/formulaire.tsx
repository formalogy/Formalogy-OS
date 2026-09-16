"use client";

import { useActionState } from "react";

import {
  BoutonEnvoyer,
  Champ,
  ChampListe,
  ChampLong,
  MessageErreur,
} from "@/app/(app)/_composants/formulaire";
import {
  creerFormation,
  modifierFormation,
  type EtatFormulaire,
} from "@/app/(app)/formations/actions";
import {
  LIBELLE_MODALITE,
  LIBELLE_STATUT_FORMATION,
  MODALITES,
  STATUTS_FORMATION,
} from "@/lib/formations-libelles";

type Props = {
  categories: { id: string; nom: string }[];
  /// Valeurs actuelles, en mode modification
  initiales?: Record<string, string> & { id: string };
};

export function FormulaireFormation({ categories, initiales }: Props) {
  const modification = Boolean(initiales);
  const [etat, envoyer] = useActionState<EtatFormulaire, FormData>(
    modification ? modifierFormation : creerFormation,
    {},
  );

  // Après une erreur, on réaffiche ce que l'utilisateur vient de saisir ;
  // sinon, les valeurs enregistrées.
  const v = (nom: string) => etat.valeurs?.[nom] ?? initiales?.[nom];

  const optionsCategorie = [
    { valeur: "", libelle: "Sans catégorie" },
    ...categories.map((c) => ({ valeur: c.id, libelle: c.nom })),
  ];

  return (
    <form
      action={envoyer}
      className="max-w-3xl rounded-xl border border-bordure bg-surface p-5 shadow-sm"
    >
      {initiales && <input type="hidden" name="id" value={initiales.id} />}

      <h2 className="mb-3 text-[13px] font-bold uppercase tracking-wider text-texte-tenu">
        Offre
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Champ nom="titre" libelle="Titre" obligatoire valeurParDefaut={v("titre")} />
        </div>
        <Champ
          nom="reference"
          libelle="Référence"
          obligatoire
          placeholder="BUR-EXC-02"
          aide="Code interne unique"
          valeurParDefaut={v("reference")}
        />
        <ChampListe
          nom="categoryId"
          libelle="Catégorie"
          options={optionsCategorie}
          valeurParDefaut={v("categoryId") ?? ""}
        />
        <ChampListe
          nom="modalite"
          libelle="Modalité"
          options={MODALITES.map((m) => ({ valeur: m, libelle: LIBELLE_MODALITE[m] }))}
          valeurParDefaut={v("modalite") ?? "PRESENTIEL"}
        />
        <ChampListe
          nom="statut"
          libelle="Statut"
          options={STATUTS_FORMATION.map((s) => ({
            valeur: s,
            libelle: LIBELLE_STATUT_FORMATION[s],
          }))}
          valeurParDefaut={v("statut") ?? "BROUILLON"}
        />
        <Champ
          nom="dureeHeures"
          libelle="Durée en heures"
          placeholder="14"
          valeurParDefaut={v("dureeHeures")}
        />
        <Champ
          nom="dureeJours"
          libelle="Durée en jours"
          placeholder="2"
          valeurParDefaut={v("dureeJours")}
        />
        <Champ
          nom="prixHT"
          libelle="Prix HT"
          placeholder="1200"
          aide="Prix de référence en euros. Modifier ce prix ne change aucune session ni facture passée."
          valeurParDefaut={v("prixHT")}
        />
        <Champ
          nom="certification"
          libelle="Certification"
          placeholder="TOSA, RS…"
          valeurParDefaut={v("certification")}
        />
      </div>

      <h2 className="mb-3 mt-6 text-[13px] font-bold uppercase tracking-wider text-texte-tenu">
        Contenu pédagogique
      </h2>
      <div className="grid gap-4">
        <ChampLong nom="description" libelle="Description" valeurParDefaut={v("description")} />
        <ChampLong nom="objectifs" libelle="Objectifs" valeurParDefaut={v("objectifs")} />
        <ChampLong nom="programme" libelle="Programme" valeurParDefaut={v("programme")} />
        <ChampLong nom="competences" libelle="Compétences visées" valeurParDefaut={v("competences")} />
        <div className="grid gap-4 sm:grid-cols-2">
          <ChampLong nom="prerequis" libelle="Prérequis" valeurParDefaut={v("prerequis")} />
          <ChampLong nom="publicVise" libelle="Public visé" valeurParDefaut={v("publicVise")} />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <BoutonEnvoyer
          libelle={modification ? "Enregistrer les modifications" : "Ajouter au catalogue"}
        />
        <MessageErreur message={etat.erreur} />
      </div>
    </form>
  );
}
