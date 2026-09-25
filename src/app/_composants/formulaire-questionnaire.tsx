"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  echelle,
  estEchelleParDefaut,
  LIBELLE_ACQUIS,
  LIBELLES_NOTE,
  RESULTATS_ACQUIS,
  type EtatReponse,
  type EvaluationDemandee,
  type Question,
} from "@/lib/questionnaires-questions";

type Valeurs = NonNullable<EtatReponse["valeurs"]>;

function Bouton({ apercu }: { apercu: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || apercu}
      className="w-full rounded-lg bg-accent px-4 py-3 text-[14px] font-semibold text-white disabled:opacity-60 sm:w-auto"
    >
      {apercu ? "Envoi désactivé dans l'aperçu" : pending ? "Envoi…" : "Envoyer mes réponses"}
    </button>
  );
}

function Intitule({ question }: { question: Question }) {
  return (
    <>
      <span className="text-[14px] font-semibold">{question.libelle}</span>{" "}
      {question.type === "CHOIX_MULTIPLE" && <span className="text-[12.5px] font-normal text-texte-doux">(plusieurs réponses possibles)</span>}
      {!question.obligatoire && question.type !== "CLASSEMENT" && (
        <span className="text-[12.5px] font-normal text-texte-tenu"> (facultatif)</span>
      )}
      {question.description && (
        <span className="mt-0.5 block whitespace-pre-line text-[12.5px] font-normal text-texte-doux">{question.description}</span>
      )}
    </>
  );
}

/// Cases à cocher, carrées dans tous les cas : une seule réponse (bouton
/// radio sous l'apparence d'une case) ou plusieurs.
function Choix({ question, valeurs }: { question: Question; valeurs?: Valeurs }) {
  const multiple = question.type === "CHOIX_MULTIPLE";
  const options = question.options ?? [];
  // Des réponses courtes tiennent sur une ligne, comme sur un questionnaire papier.
  const enLigne = options.length <= 4 && options.every((o) => o.length <= 18);
  const deja = valeurs?.[question.id];
  return (
    <fieldset>
      <legend className="mb-2">
        <Intitule question={question} />
      </legend>
      <div className={enLigne ? "flex flex-wrap gap-x-6 gap-y-1.5" : "flex flex-col gap-1.5"}>
        {options.map((option) => (
          <label key={option} className="flex cursor-pointer items-start gap-2.5 text-[14px]">
            <input
              type={multiple ? "checkbox" : "radio"}
              name={question.id}
              value={option}
              required={!multiple && question.obligatoire}
              defaultChecked={Array.isArray(deja) ? deja.includes(option) : deja === option}
              className="case-a-cocher mt-px"
            />
            <span>{option}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Note({ question, valeurs }: { question: Question; valeurs?: Valeurs }) {
  const deja = valeurs?.[question.id];
  // Échelle choisie dans l'éditeur (0 à 10, par exemple) : une case par note,
  // les bornes rappelées aux extrémités. L'échelle de 1 à 5 garde ses libellés.
  if (!estEchelleParDefaut(question)) {
    const { min, max } = echelle(question);
    const notes = Array.from({ length: max - min + 1 }, (_, i) => min + i);
    return (
      <fieldset>
        <legend className="mb-2">
          <Intitule question={question} />
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {notes.map((n) => (
            <label
              key={n}
              className="flex min-w-[2.75rem] flex-1 cursor-pointer flex-col items-center gap-1 rounded-lg border border-bordure px-1 py-2 has-[:checked]:border-accent has-[:checked]:bg-accent-pale"
            >
              <input
                type="radio"
                name={question.id}
                value={n}
                required={question.obligatoire}
                defaultChecked={deja === String(n)}
                className="case-a-cocher"
              />
              <span className="font-mono text-[13px] font-semibold">{n}</span>
            </label>
          ))}
        </div>
      </fieldset>
    );
  }
  return (
    <fieldset>
      <legend className="mb-2">
        <Intitule question={question} />
      </legend>
      <div className="grid grid-cols-5 gap-1.5">
        {LIBELLES_NOTE.map((libelle, i) => (
          <label
            key={libelle}
            className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-bordure px-1 py-2 text-center has-[:checked]:border-accent has-[:checked]:bg-accent-pale"
          >
            <input
              type="radio"
              name={question.id}
              value={i + 1}
              required={question.obligatoire}
              defaultChecked={deja === String(i + 1)}
              className="case-a-cocher"
            />
            <span className="font-mono text-[13px] font-semibold">{i + 1}</span>
            <span className="text-[10.5px] leading-tight text-texte-doux">{libelle}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/// Réponses ordonnées : la personne range les éléments du plus au moins
/// important, avec des flèches (utilisables au doigt comme au clavier).
/// L'ordre est envoyé tel qu'affiché.
function Classement({ question, valeurs }: { question: Question; valeurs?: Valeurs }) {
  const deja = valeurs?.[question.id];
  const [ordre, setOrdre] = useState<string[]>(Array.isArray(deja) && deja.length > 0 ? deja : (question.options ?? []));
  const deplacer = (index: number, sens: -1 | 1) =>
    setOrdre((o) => {
      const cible = index + sens;
      if (cible < 0 || cible >= o.length) return o;
      const copie = [...o];
      [copie[index], copie[cible]] = [copie[cible], copie[index]];
      return copie;
    });
  const bouton =
    "grid size-7 place-items-center rounded-md border border-bordure text-[13px] text-texte-doux hover:bg-surface-creuse disabled:opacity-30 disabled:hover:bg-transparent";
  return (
    <fieldset>
      <legend className="mb-1">
        <Intitule question={question} />
      </legend>
      <p className="mb-2 text-[12.5px] text-texte-doux">Classez du premier au dernier avec les flèches.</p>
      <ol className="flex flex-col gap-1.5">
        {ordre.map((element, index) => (
          <li key={element} className="flex items-center gap-2.5 rounded-lg border border-bordure px-3 py-2">
            <span className="w-5 shrink-0 font-mono text-[13px] font-semibold text-accent-fort">{index + 1}</span>
            <span className="min-w-0 flex-1 text-[14px]">{element}</span>
            <input type="hidden" name={question.id} value={element} />
            <button type="button" onClick={() => deplacer(index, -1)} disabled={index === 0} aria-label={`Monter « ${element} »`} className={bouton}>
              ↑
            </button>
            <button
              type="button"
              onClick={() => deplacer(index, 1)}
              disabled={index === ordre.length - 1}
              aria-label={`Descendre « ${element} »`}
              className={bouton}
            >
              ↓
            </button>
          </li>
        ))}
      </ol>
    </fieldset>
  );
}

function Texte({ question, valeurs }: { question: Question; valeurs?: Valeurs }) {
  const deja = valeurs?.[question.id];
  return (
    <label className="block">
      <Intitule question={question} />
      <textarea
        name={question.id}
        rows={3}
        maxLength={2000}
        required={question.obligatoire}
        defaultValue={typeof deja === "string" ? deja : ""}
        className="mt-1.5 w-full rounded-lg border border-bordure bg-surface px-3 py-2 text-[14px] outline-none focus:border-accent focus:ring-2 focus:ring-accent-pale"
      />
    </label>
  );
}

/// Évaluation des acquis, apprenant par apprenant (bilan du formateur).
function Evaluation({ evaluation, valeurs }: { evaluation: EvaluationDemandee; valeurs?: Valeurs }) {
  return (
    <section className="mt-5 border-t border-bordure pt-5">
      <h2 className="pb-1 text-[12px] font-bold uppercase tracking-wider text-accent-fort">Évaluation des acquis</h2>
      <p className="mb-1 text-[13px] text-texte-doux">
        Pour chaque apprenant, les objectifs de la formation sont-ils atteints ? Cette évaluation figure sur son attestation
        de fin de formation.
      </p>
      {evaluation.apprenants.length === 0 && (
        <p className="py-4 text-[13px] text-texte-tenu">Aucun apprenant inscrit à cette session.</p>
      )}
      {evaluation.apprenants.map((apprenant) => {
        const existante = evaluation.existantes[apprenant.id];
        const deja = valeurs?.[`acquis_${apprenant.id}`] ?? existante?.resultat;
        const commentaire = valeurs?.[`commentaire_${apprenant.id}`] ?? existante?.commentaire ?? "";
        // Le filet est porté par un conteneur : sur un <fieldset>, la légende
        // coupe la bordure.
        return (
          <div key={apprenant.id} className="border-t border-bordure-douce py-4 first-of-type:border-t-0">
            <fieldset>
              <legend className="mb-2 text-[14px] font-semibold">{apprenant.nom}</legend>
              <div className="flex flex-wrap gap-x-6 gap-y-1.5">
                {RESULTATS_ACQUIS.map((resultat) => (
                  <label key={resultat} className="flex cursor-pointer items-start gap-2.5 text-[14px]">
                    <input
                      type="radio"
                      name={`acquis_${apprenant.id}`}
                      value={resultat}
                      required
                      defaultChecked={deja === resultat}
                      className="case-a-cocher mt-px"
                    />
                    <span>{LIBELLE_ACQUIS[resultat]}</span>
                  </label>
                ))}
              </div>
              <input
                name={`commentaire_${apprenant.id}`}
                maxLength={300}
                defaultValue={typeof commentaire === "string" ? commentaire : ""}
                placeholder="Commentaire, repris sur l'attestation (facultatif)"
                aria-label={`Commentaire sur l'évaluation de ${apprenant.nom}`}
                className="mt-2 w-full rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent-pale"
              />
            </fieldset>
          </div>
        );
      })}
    </section>
  );
}

type Props = {
  questions: Question[];
  /// Bilan du formateur : évaluation des acquis de chaque apprenant.
  evaluation?: EvaluationDemandee;
  /// Réponse enregistrée par le serveur. Absente en aperçu.
  action?: (etat: EtatReponse, donnees: FormData) => Promise<EtatReponse>;
  jeton?: string;
  messageMerci?: string;
};

const sansEnvoi = async (etat: EtatReponse): Promise<EtatReponse> => etat;

/// Formulaire en ligne d'un questionnaire, commun à tous les questionnaires
/// (satisfaction, positionnement, à froid, formateurs, financeurs) et à
/// l'aperçu montré dans l'application.
export function FormulaireQuestionnaire({ questions, evaluation, action, jeton, messageMerci }: Props) {
  const apercu = !action;
  const [etat, envoyer] = useActionState<EtatReponse, FormData>(action ?? sansEnvoi, {});

  if (etat.merci) {
    return (
      <div className="rounded-xl border border-bordure bg-surface p-6 text-center shadow-sm">
        <p className="text-[17px] font-bold">Merci pour votre réponse !</p>
        <p className="mt-1 text-[13.5px] text-texte-doux">{messageMerci ?? "Vous pouvez fermer cette page."}</p>
      </div>
    );
  }

  // Après une erreur, le formulaire est reconstruit avec les réponses déjà
  // données : React vide les champs à chaque envoi.
  return (
    <form key={etat.essai ?? 0} action={envoyer} className="rounded-xl border border-bordure bg-surface p-5 shadow-sm">
      {questions.map((q, index) => (
        // Le filet de séparation est porté par un conteneur : sur un
        // <fieldset>, la légende coupe la bordure. L'intertitre d'une
        // nouvelle partie fait office de séparation.
        <div key={q.id}>
          {q.section && (
            <h2
              className={`pb-1 text-[12px] font-bold uppercase tracking-wider text-accent-fort ${index === 0 ? "" : "mt-5 border-t border-bordure pt-5"}`}
            >
              {q.section}
            </h2>
          )}
          <div className={`py-4 ${index > 0 && !q.section ? "border-t border-bordure-douce" : ""}`}>
            {q.type === "NOTE" ? (
              <Note question={q} valeurs={etat.valeurs} />
            ) : q.type === "TEXTE" ? (
              <Texte question={q} valeurs={etat.valeurs} />
            ) : q.type === "CLASSEMENT" ? (
              <Classement question={q} valeurs={etat.valeurs} />
            ) : (
              <Choix question={q} valeurs={etat.valeurs} />
            )}
          </div>
        </div>
      ))}
      {evaluation && <Evaluation evaluation={evaluation} valeurs={etat.valeurs} />}
      {etat.erreur && (
        <p role="alert" className="mt-2 rounded-lg bg-danger-pale px-3 py-2 text-[13px] text-danger">
          {etat.erreur}
        </p>
      )}
      {jeton && <input type="hidden" name="jeton" value={jeton} />}
      <div className="mt-4">
        <Bouton apercu={apercu} />
      </div>
    </form>
  );
}
