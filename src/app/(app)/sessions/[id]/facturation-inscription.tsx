"use client";

import { useActionState, useState } from "react";

import { ChampsFacturation } from "@/app/(app)/_composants/champs-facturation";
import { modifierFacturationInscription, type EtatFormulaire } from "@/app/(app)/sessions/actions";
import { formaterEuros } from "@/lib/crm-libelles";
import type { PayeurInscription } from "@/lib/inscriptions-facturation";

type Props = {
  sessionId: string;
  learnerId: string;
  /// Résumé affiché : « facturé à OPCO EP (dossier 123) »
  description: string;
  payeur: PayeurInscription;
  prix: string | null;
  financeur: { nom: string | null; reference: string | null; email: string | null };
  financeursConnus: string[];
  /// Faux une fois l'inscription facturée
  modifiable: boolean;
};

/// Facturation d'un apprenant inscrit (payeur et tarif), corrigeable tant
/// que l'inscription n'est pas facturée.
export function FacturationInscription(props: Props) {
  const [edition, setEdition] = useState(false);
  const [etat, envoyer, enCours] = useActionState<EtatFormulaire, FormData>(modifierFacturationInscription, {});

  // Une correction enregistrée referme la saisie.
  const [etatVu, setEtatVu] = useState(etat);
  if (etat !== etatVu) {
    setEtatVu(etat);
    if (!etat.erreur) setEdition(false);
  }

  if (!edition) {
    return (
      <div className="text-[11.5px]">
        <span className={props.prix === null ? "font-semibold text-alerte" : "font-mono tabular-nums text-texte-doux"}>
          {props.prix === null ? "tarif à indiquer" : `${formaterEuros(props.prix)} HT`}
        </span>
        <span className="text-texte-doux"> · {props.description}</span>
        {props.modifiable ? (
          <button type="button" onClick={() => setEdition(true)} className="ml-1.5 font-semibold text-accent-fort hover:underline">
            modifier
          </button>
        ) : (
          <span className="text-texte-tenu"> · facturé</span>
        )}
      </div>
    );
  }

  return (
    <form action={envoyer} className="mt-2 rounded-lg border border-bordure bg-surface-creuse/50 p-3">
      <input type="hidden" name="sessionId" value={props.sessionId} />
      <input type="hidden" name="learnerId" value={props.learnerId} />
      <ChampsFacturation payeur={props.payeur} prix={props.prix} financeur={props.financeur} financeursConnus={props.financeursConnus} />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="submit" disabled={enCours} className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-60">
          {enCours ? "Enregistrement…" : "Enregistrer"}
        </button>
        <button type="button" onClick={() => setEdition(false)} className="text-[12px] font-semibold text-texte-tenu hover:underline">
          Annuler
        </button>
        {etat.erreur && <span className="text-[12px] text-danger">{etat.erreur}</span>}
      </div>
    </form>
  );
}
