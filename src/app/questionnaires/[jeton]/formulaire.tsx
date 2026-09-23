"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { repondreQuestionnaireQualite, type EtatQuestionnaireQualite } from "@/app/questionnaires/actions";
import type { QuestionQuestionnaire } from "@/lib/questionnaires-questions";

function Bouton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="w-full rounded-lg bg-accent px-4 py-3 text-[14px] font-semibold text-white disabled:opacity-60 sm:w-auto">
      {pending ? "Envoi…" : "Envoyer mes réponses"}
    </button>
  );
}

function Section({ titre, premiere }: { titre: string; premiere: boolean }) {
  return (
    <h2
      className={`pb-1 text-[12px] font-bold uppercase tracking-wider text-accent-fort ${
        premiere ? "" : "mt-5 border-t border-bordure pt-5"
      }`}
    >
      {titre}
    </h2>
  );
}

function Case({ question, separateur }: { question: Extract<QuestionQuestionnaire, { type: "CASE" }>; separateur: boolean }) {
  return (
    <label className={`flex cursor-pointer items-start gap-3 py-4 ${separateur ? "border-t border-bordure-douce" : ""}`}>
      <input type="checkbox" name={question.code} value="on" className="mt-0.5 size-4 accent-[var(--color-accent)]" />
      <span className="text-[14px] font-semibold">{question.libelle}</span>
    </label>
  );
}

function Commentaire({ question, separateur }: { question: Extract<QuestionQuestionnaire, { type: "COMMENTAIRE" }>; separateur: boolean }) {
  return (
    <label className={`block py-4 ${separateur ? "border-t border-bordure-douce" : ""}`}>
      <span className="text-[14px] font-semibold">
        {question.libelle} {!question.obligatoire && <span className="font-normal text-texte-tenu">(facultatif)</span>}
      </span>
      <textarea
        name={question.code}
        rows={3}
        maxLength={2000}
        required={question.obligatoire}
        className="mt-1.5 w-full rounded-lg border border-bordure bg-surface px-3 py-2 text-[14px] outline-none focus:border-accent focus:ring-2 focus:ring-accent-pale"
      />
    </label>
  );
}

type Props = { jeton: string; questions: QuestionQuestionnaire[] };

export function FormulaireQuestionnaireQualite({ jeton, questions }: Props) {
  const [etat, envoyer] = useActionState<EtatQuestionnaireQualite, FormData>(repondreQuestionnaireQualite, {});

  if (etat.merci) {
    return (
      <div className="rounded-xl border border-bordure bg-surface p-6 text-center shadow-sm">
        <p className="text-[17px] font-bold">Merci pour votre réponse !</p>
        <p className="mt-1 text-[13.5px] text-texte-doux">Vous pouvez fermer cette page.</p>
      </div>
    );
  }

  return (
    <form action={envoyer} className="rounded-xl border border-bordure bg-surface p-5 shadow-sm">
      {questions.map((q, index) => {
        // Un trait sépare deux questions voisines ; l'intertitre d'une
        // nouvelle partie fait office de séparation, et la première question
        // n'en a pas besoin.
        const separateur = index > 0 && !q.section;
        return (
          <div key={q.code}>
            {q.section && <Section titre={q.section} premiere={index === 0} />}
            {q.type === "CASE" ? <Case question={q} separateur={separateur} /> : <Commentaire question={q} separateur={separateur} />}
          </div>
        );
      })}
      {etat.erreur && <p role="alert" className="mt-4 rounded-lg bg-danger-pale px-3 py-2 text-[13px] text-danger">{etat.erreur}</p>}
      <input type="hidden" name="jeton" value={jeton} />
      <div className="mt-5">
        <Bouton />
      </div>
    </form>
  );
}
