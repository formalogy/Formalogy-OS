"use client";

import { useActionState, useState } from "react";

import { BoutonEnvoyer, Champ, ChampListe, ChampLong, MessageErreur } from "@/app/(app)/_composants/formulaire";
import { creerFacture, modifierFacture, type EtatFormulaire } from "@/app/(app)/factures/actions";
import { LIBELLE_PAYEUR, lireMontant, montantTTC, TAUX_TVA, TYPES_PAYEUR } from "@/lib/factures";

type Option = { id: string; libelle: string };

type Props = {
  sessions: Option[];
  entreprises: Option[];
  apprenants: Option[];
  initiales?: Record<string, string> & { id?: string };
};

export function FormulaireFacture({ sessions, entreprises, apprenants, initiales }: Props) {
  const modification = Boolean(initiales?.id);
  const [etat, envoyer] = useActionState<EtatFormulaire, FormData>(modification ? modifierFacture : creerFacture, {});
  const v = (nom: string) => etat.valeurs?.[nom] ?? initiales?.[nom];
  const [ht, setHt] = useState(v("montantHT") ?? "");
  const [tva, setTva] = useState(v("tauxTva") ?? "0");
  const htLu = lireMontant(ht);
  const aucun = (libelle: string) => ({ valeur: "", libelle });

  return (
    <form action={envoyer} className="max-w-3xl rounded-xl border border-bordure bg-surface p-5 shadow-sm">
      {initiales?.id && <input type="hidden" name="id" value={initiales.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Champ nom="objet" libelle="Objet" obligatoire placeholder="Formation Excel — session S-2026-0007" valeurParDefaut={v("objet")} />
        </div>
        <ChampListe
          nom="payeurType"
          libelle="Payeur"
          options={TYPES_PAYEUR.map((t) => ({ valeur: t, libelle: LIBELLE_PAYEUR[t] }))}
          valeurParDefaut={v("payeurType") ?? "ENTREPRISE"}
        />
        <Champ nom="payeurNom" libelle="Nom du payeur" obligatoire placeholder="Raison sociale, OPCO, nom de l'apprenant…" valeurParDefaut={v("payeurNom")} />

        <label className="block text-[12.5px] font-semibold">
          Montant HT (€)
          <input
            name="montantHT"
            required
            inputMode="decimal"
            value={ht}
            onChange={(e) => setHt(e.target.value)}
            placeholder="1250"
            className="mt-1.5 w-full rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] font-normal outline-none focus:border-accent focus:ring-2 focus:ring-accent-pale"
          />
        </label>
        <label className="block text-[12.5px] font-semibold">
          TVA
          <select
            name="tauxTva"
            value={tva}
            onChange={(e) => setTva(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] font-normal outline-none focus:border-accent"
          >
            {TAUX_TVA.map((t) => (
              <option key={t} value={t}>
                {t === "0" ? "0 % — exonérée (formation professionnelle)" : `${t.replace(".", ",")} %`}
              </option>
            ))}
          </select>
        </label>
        <p className="text-[12.5px] text-texte-doux sm:col-span-2">
          Montant TTC :{" "}
          <strong className="font-mono text-texte">
            {htLu ? `${Number(montantTTC(htLu, tva)).toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €` : "—"}
          </strong>
          {tva === "0" && <span className="text-texte-tenu"> · pensez à la mention d&apos;exonération sur la facture Henrri</span>}
        </p>
      </div>

      <h2 className="mb-1 mt-6 text-[13px] font-bold uppercase tracking-wider text-texte-tenu">Rattachement</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <ChampListe nom="sessionId" libelle="Session" options={[aucun("Aucune"), ...sessions.map((o) => ({ valeur: o.id, libelle: o.libelle }))]} valeurParDefaut={v("sessionId") ?? ""} />
        </div>
        <ChampListe nom="companyId" libelle="Entreprise" options={[aucun("Aucune"), ...entreprises.map((o) => ({ valeur: o.id, libelle: o.libelle }))]} valeurParDefaut={v("companyId") ?? ""} />
        <ChampListe nom="learnerId" libelle="Apprenant" options={[aucun("Aucun"), ...apprenants.map((o) => ({ valeur: o.id, libelle: o.libelle }))]} valeurParDefaut={v("learnerId") ?? ""} />
        <div className="sm:col-span-2">
          <ChampLong nom="notes" libelle="Notes internes" valeurParDefaut={v("notes")} />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <BoutonEnvoyer libelle={modification ? "Enregistrer" : "Préparer la facture"} />
        <MessageErreur message={etat.erreur} />
      </div>
    </form>
  );
}
