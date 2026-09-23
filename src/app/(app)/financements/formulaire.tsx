"use client";

import { useActionState } from "react";

import { BoutonEnvoyer, Champ, ChampListe, ChampLong, MessageErreur } from "@/app/(app)/_composants/formulaire";
import { creerDossier, modifierDossier, type EtatFormulaire } from "@/app/(app)/financements/actions";
import { LIBELLE_FINANCEUR, OPCO_COURANTS, TYPES_FINANCEUR } from "@/lib/financements";

type Option = { id: string; libelle: string };

type Props = {
  sessions: Option[];
  entreprises: Option[];
  apprenants: Option[];
  initiales?: Record<string, string> & { id?: string };
};

export function FormulaireDossier({ sessions, entreprises, apprenants, initiales }: Props) {
  const modification = Boolean(initiales?.id);
  const [etat, envoyer] = useActionState<EtatFormulaire, FormData>(modification ? modifierDossier : creerDossier, {});
  const v = (nom: string) => etat.valeurs?.[nom] ?? initiales?.[nom];
  const aucun = (libelle: string) => ({ valeur: "", libelle });

  return (
    <form action={envoyer} className="max-w-3xl rounded-xl border border-bordure bg-surface p-5 shadow-sm">
      {initiales?.id && <input type="hidden" name="id" value={initiales.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <ChampListe
          nom="financeurType"
          libelle="Type de financeur"
          options={TYPES_FINANCEUR.map((t) => ({ valeur: t, libelle: LIBELLE_FINANCEUR[t] }))}
          valeurParDefaut={v("financeurType") ?? "OPCO"}
        />
        <div>
          <label htmlFor="financeurNom" className="block text-[12.5px] font-semibold">
            Nom du financeur
          </label>
          <input
            id="financeurNom"
            name="financeurNom"
            required
            list="opco-courants"
            defaultValue={v("financeurNom")}
            placeholder="OPCO EP, France Travail — agence de Lille…"
            className="mt-1.5 w-full rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent-pale"
          />
          <datalist id="opco-courants">
            {OPCO_COURANTS.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        </div>
        <Champ nom="reference" libelle="Numéro de dossier" placeholder="Attribué par le financeur" valeurParDefaut={v("reference")} />
        <Champ nom="montant" libelle="Montant (€)" placeholder="1250" valeurParDefaut={v("montant")} />
        <Champ nom="dateDepot" libelle="Déposé le" type="date" aide="Facultatif, pour votre suivi." valeurParDefaut={v("dateDepot")} />
        <label className="flex items-center gap-2 self-end pb-2 text-[12.5px] font-semibold">
          <input type="checkbox" name="subrogation" defaultChecked={(v("subrogation") ?? "on") === "on"} />
          Subrogation (le financeur paie directement l&apos;organisme)
        </label>
      </div>

      <h2 className="mb-1 mt-6 text-[13px] font-bold uppercase tracking-wider text-texte-tenu">Rattachement</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <ChampListe nom="sessionId" libelle="Session" options={[aucun("Aucune"), ...sessions.map((o) => ({ valeur: o.id, libelle: o.libelle }))]} valeurParDefaut={v("sessionId") ?? ""} />
        </div>
        <ChampListe nom="companyId" libelle="Entreprise" options={[aucun("Aucune"), ...entreprises.map((o) => ({ valeur: o.id, libelle: o.libelle }))]} valeurParDefaut={v("companyId") ?? ""} />
        <ChampListe nom="learnerId" libelle="Apprenant" options={[aucun("Aucun"), ...apprenants.map((o) => ({ valeur: o.id, libelle: o.libelle }))]} valeurParDefaut={v("learnerId") ?? ""} />
        <div className="sm:col-span-2">
          <ChampLong nom="notes" libelle="Notes" valeurParDefaut={v("notes")} />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <BoutonEnvoyer libelle={modification ? "Enregistrer" : "Créer le dossier"} />
        <MessageErreur message={etat.erreur} />
      </div>
    </form>
  );
}
