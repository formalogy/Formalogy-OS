"use client";

import { useActionState } from "react";

import {
  BoutonEnvoyer,
  Champ,
  ChampListe,
  ChampLong,
  MessageErreur,
} from "@/app/(app)/_composants/formulaire";
import { deposerDocument, type EtatFormulaire } from "@/app/(app)/documents/actions";
import {
  ATTRIBUT_ACCEPT,
  CATEGORIES_DOCUMENT,
  formaterTaille,
  LIBELLE_CATEGORIE_DOCUMENT,
  LIBELLE_STATUT_DOCUMENT,
  STATUTS_DOCUMENT,
  TAILLE_MAX_OCTETS,
} from "@/lib/documents-libelles";

type Option = { id: string; libelle: string };

type Props = {
  types: (Option & { categorie: string })[];
  apprenants: Option[];
  entreprises: Option[];
  sessions: Option[];
  formations: Option[];
  valeursDeDepart: Record<string, string>;
  stockagePret: boolean;
};

export function FormulaireDocument(props: Props) {
  const [etat, envoyer] = useActionState<EtatFormulaire, FormData>(deposerDocument, {});
  const v = (nom: string) => etat.valeurs?.[nom] ?? props.valeursDeDepart[nom];
  const aucun = (libelle: string) => ({ valeur: "", libelle });
  const options = (liste: Option[]) => liste.map((o) => ({ valeur: o.id, libelle: o.libelle }));

  return (
    <form action={envoyer} className="max-w-3xl rounded-xl border border-bordure bg-surface p-5 shadow-sm">
      {!props.stockagePret && (
        <p className="mb-4 rounded-lg bg-alerte/12 px-3 py-2 text-[12.5px] text-alerte">
          Le stockage des fichiers n&apos;est pas encore configuré : le dépôt échouera tant que la clé
          Supabase n&apos;est pas renseignée.
        </p>
      )}

      <div>
        <label htmlFor="fichier" className="block text-[12.5px] font-semibold">
          Fichier
        </label>
        <input
          id="fichier"
          name="fichier"
          type="file"
          required
          accept={ATTRIBUT_ACCEPT}
          className="mt-1.5 block w-full text-[13px] file:mr-3 file:rounded-lg file:border file:border-bordure file:bg-surface-creuse file:px-3 file:py-2 file:text-[12.5px] file:font-semibold"
        />
        <p className="mt-1 text-[11.5px] text-texte-tenu">
          PDF, image, Word, Excel, PowerPoint, OpenDocument, CSV ou texte — {formaterTaille(TAILLE_MAX_OCTETS)} maximum.
          {etat.erreur && " Après une erreur, le fichier doit être choisi à nouveau."}
        </p>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Champ nom="nom" libelle="Nom du document" obligatoire valeurParDefaut={v("nom")} />
        </div>
        <ChampListe
          nom="typeId"
          libelle="Type"
          options={[aucun("Non précisé"), ...props.types.map((t) => ({ valeur: t.id, libelle: t.libelle }))]}
          valeurParDefaut={v("typeId") ?? ""}
        />
        <ChampListe
          nom="categorie"
          libelle="Catégorie"
          options={[aucun("Choisir…"), ...CATEGORIES_DOCUMENT.map((c) => ({ valeur: c, libelle: LIBELLE_CATEGORIE_DOCUMENT[c] }))]}
          valeurParDefaut={v("categorie") ?? ""}
        />
        <ChampListe
          nom="statut"
          libelle="Statut"
          options={STATUTS_DOCUMENT.map((s) => ({ valeur: s, libelle: LIBELLE_STATUT_DOCUMENT[s] }))}
          valeurParDefaut={v("statut") ?? "VALIDE"}
        />
      </div>

      <h2 className="mb-1 mt-6 text-[13px] font-bold uppercase tracking-wider text-texte-tenu">Rattachement</h2>
      <p className="mb-3 text-[12px] text-texte-tenu">
        Facultatif. Un document rattaché apparaît sur la fiche correspondante.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <ChampListe nom="learnerId" libelle="Apprenant" options={[aucun("Aucun"), ...options(props.apprenants)]} valeurParDefaut={v("learnerId") ?? ""} />
        <ChampListe nom="companyId" libelle="Entreprise" options={[aucun("Aucune"), ...options(props.entreprises)]} valeurParDefaut={v("companyId") ?? ""} />
        <ChampListe nom="sessionId" libelle="Session" options={[aucun("Aucune"), ...options(props.sessions)]} valeurParDefaut={v("sessionId") ?? ""} />
        <ChampListe nom="formationId" libelle="Formation" options={[aucun("Aucune"), ...options(props.formations)]} valeurParDefaut={v("formationId") ?? ""} />
        <div className="sm:col-span-2">
          <ChampLong nom="description" libelle="Description" valeurParDefaut={v("description")} />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <BoutonEnvoyer libelle="Déposer le document" />
        <MessageErreur message={etat.erreur} />
      </div>
    </form>
  );
}
