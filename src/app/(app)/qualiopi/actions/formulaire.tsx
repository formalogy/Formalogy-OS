"use client";

import { useActionState, useEffect, useRef } from "react";

import { BoutonEnvoyer, MessageErreur } from "@/app/(app)/_composants/formulaire";
import { creerActionQualite, type EtatFormulaire } from "@/app/(app)/qualiopi/actions";
import { LIBELLE_ORIGINE_ACTION, ORIGINES_ACTION } from "@/lib/qualiopi";

const CHAMP =
  "mt-1 w-full rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] font-normal outline-none focus:border-accent focus:ring-2 focus:ring-accent-pale";

export function FormulaireAction({ indicateurs, indicateurParDefaut }: { indicateurs: { numero: number; intitule: string }[]; indicateurParDefaut?: string }) {
  const [etat, envoyer, enCours] = useActionState<EtatFormulaire, FormData>(creerActionQualite, {});
  const formulaire = useRef<HTMLFormElement>(null);

  // Action créée : on vide le formulaire pour la suivante.
  useEffect(() => {
    if (!enCours && etat.succes) formulaire.current?.reset();
  }, [enCours, etat]);

  const v = (nom: string) => etat.valeurs?.[nom];

  return (
    <form ref={formulaire} action={envoyer} className="rounded-xl border border-bordure bg-surface p-4 shadow-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-[12.5px] font-semibold sm:col-span-2">
          Action à mener
          <input name="titre" required defaultValue={v("titre")} placeholder="Ex. : mettre à jour la page tarifs du site" className={CHAMP} />
        </label>
        <label className="text-[12.5px] font-semibold">
          Origine
          <select key={v("origine")} name="origine" defaultValue={v("origine") ?? "INTERNE"} className={CHAMP}>
            {ORIGINES_ACTION.map((o) => (
              <option key={o} value={o}>{LIBELLE_ORIGINE_ACTION[o]}</option>
            ))}
          </select>
        </label>
        <label className="text-[12.5px] font-semibold">
          Indicateur concerné <span className="font-normal text-texte-tenu">(facultatif)</span>
          <select key={v("numeroIndicateur") ?? indicateurParDefaut} name="numeroIndicateur" defaultValue={v("numeroIndicateur") ?? indicateurParDefaut ?? ""} className={CHAMP}>
            <option value="">Aucun</option>
            {indicateurs.map((i) => (
              <option key={i.numero} value={i.numero}>
                {i.numero} — {i.intitule.slice(0, 70)}…
              </option>
            ))}
          </select>
        </label>
        <label className="text-[12.5px] font-semibold">
          Responsable <span className="font-normal text-texte-tenu">(facultatif)</span>
          <input name="responsable" defaultValue={v("responsable")} className={CHAMP} />
        </label>
        <label className="text-[12.5px] font-semibold">
          Échéance <span className="font-normal text-texte-tenu">(facultatif)</span>
          <input name="echeance" type="date" defaultValue={v("echeance")} className={CHAMP} />
        </label>
        <label className="text-[12.5px] font-semibold sm:col-span-2">
          Détail <span className="font-normal text-texte-tenu">(facultatif)</span>
          <textarea name="description" rows={2} defaultValue={v("description")} className={CHAMP} />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <BoutonEnvoyer libelle="Ajouter l'action" />
        {etat.succes && <span className="text-[12.5px] font-semibold text-succes">{etat.succes}</span>}
        <MessageErreur message={etat.erreur} />
      </div>
    </form>
  );
}
