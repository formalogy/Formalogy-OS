"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { repondreQuestionnaire, type EtatQuestionnaire } from "@/app/questionnaire/actions";
import { LIBELLES_NOTE, QUESTIONS_SATISFACTION } from "@/lib/satisfaction-questions";

function Bouton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="w-full rounded-lg bg-accent px-4 py-3 text-[14px] font-semibold text-white disabled:opacity-60 sm:w-auto">
      {pending ? "Envoi…" : "Envoyer mes réponses"}
    </button>
  );
}

function Echelle({ nom, libelle }: { nom: string; libelle: string }) {
  // Le filet de séparation est porté par un conteneur : sur un <fieldset>,
  // la légende coupe la bordure.
  return (
    <div className="border-t border-bordure-douce py-4 first:border-t-0">
      <fieldset>
        <legend className="mb-2 text-[14px] font-semibold">{libelle}</legend>
        <div className="grid grid-cols-5 gap-1.5">
          {LIBELLES_NOTE.map((l, i) => (
            <label key={l} className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-bordure px-1 py-2 text-center has-[:checked]:border-accent has-[:checked]:bg-accent-pale">
              <input type="radio" name={nom} value={i + 1} required className="accent-[var(--color-accent)]" />
              <span className="font-mono text-[13px] font-semibold">{i + 1}</span>
              <span className="text-[10.5px] leading-tight text-texte-doux">{l}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

export function FormulaireQuestionnaire({ jeton }: { jeton: string }) {
  const [etat, envoyer] = useActionState<EtatQuestionnaire, FormData>(repondreQuestionnaire, {});

  if (etat.merci) {
    return (
      <div className="rounded-xl border border-bordure bg-surface p-6 text-center shadow-sm">
        <p className="text-[17px] font-bold">Merci pour votre réponse !</p>
        <p className="mt-1 text-[13.5px] text-texte-doux">Elle nous aide à améliorer nos formations. Vous pouvez fermer cette page.</p>
      </div>
    );
  }

  const zone = "mt-1.5 w-full rounded-lg border border-bordure bg-surface px-3 py-2 text-[14px] outline-none focus:border-accent focus:ring-2 focus:ring-accent-pale";

  return (
    <form action={envoyer} className="rounded-xl border border-bordure bg-surface p-5 shadow-sm">
      {QUESTIONS_SATISFACTION.map((q) => (
        <Echelle key={q.cle} nom={q.cle} libelle={q.libelle} />
      ))}
      <Echelle nom="globale" libelle="Globalement, êtes-vous satisfait(e) de cette formation ?" />
      <label className="mt-2 block text-[14px] font-semibold">
        Ce que vous avez le plus apprécié <span className="font-normal text-texte-tenu">(facultatif)</span>
        <textarea name="pointsForts" rows={3} maxLength={2000} className={zone} />
      </label>
      <label className="mt-4 block text-[14px] font-semibold">
        Ce qui pourrait être amélioré <span className="font-normal text-texte-tenu">(facultatif)</span>
        <textarea name="ameliorations" rows={3} maxLength={2000} className={zone} />
      </label>
      {etat.erreur && <p role="alert" className="mt-4 rounded-lg bg-danger-pale px-3 py-2 text-[13px] text-danger">{etat.erreur}</p>}
      <input type="hidden" name="jeton" value={jeton} />
      <div className="mt-5">
        <Bouton />
      </div>
    </form>
  );
}
