"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";

import { modifierQuestionnaire, type EtatEditeur } from "@/app/(app)/questionnaires/modeles/actions";
import {
  LIBELLE_TYPE_QUESTION,
  TYPES_QUESTION,
  type CodeQuestionnaire,
  type ContenuQuestionnaire,
  type Question,
  type TypeQuestion,
} from "@/lib/questionnaires-questions";

const CHAMP =
  "mt-1.5 w-full rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent-pale";
const ETIQUETTE = "block text-[12.5px] font-semibold";
const PETIT_BOUTON =
  "rounded-md border border-bordure px-2 py-1 text-[12px] font-semibold text-texte-doux hover:bg-surface-creuse disabled:opacity-40 disabled:hover:bg-transparent";

const estChoix = (type: TypeQuestion) => type === "CHOIX_UNIQUE" || type === "CHOIX_MULTIPLE";

/// Identifiant d'une nouvelle question : court, et distinct de tous ceux du
/// questionnaire, pour que ses réponses ne se mêlent jamais à une autre.
function nouvelIdentifiant(questions: Question[]): string {
  const pris = new Set(questions.map((q) => q.id));
  let id: string;
  do id = `q_${Math.random().toString(36).slice(2, 8)}`;
  while (pris.has(id));
  return id;
}

function CarteQuestion({
  question,
  numero,
  total,
  satisfaction,
  modifier,
  deplacer,
  supprimer,
}: {
  question: Question;
  numero: number;
  total: number;
  satisfaction: boolean;
  modifier: (changement: Partial<Question>) => void;
  deplacer: (sens: -1 | 1) => void;
  supprimer: () => void;
}) {
  const id = (champ: string) => `${question.id}-${champ}`;

  function changerType(type: TypeQuestion) {
    // Une question qui devient « à cases » reçoit un point de départ plutôt
    // qu'une liste vide ; ses cases éventuelles sont conservées sinon.
    const options = estChoix(type) && !(question.options ?? []).some((o) => o.trim()) ? ["Oui", "Non"] : question.options;
    modifier({ type, options, globale: type === "NOTE" ? question.globale : undefined });
  }

  return (
    <li className="rounded-xl border border-bordure bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-texte-tenu">Question {numero}</span>
        <div className="flex gap-1.5">
          <button type="button" onClick={() => deplacer(-1)} disabled={numero === 1} className={PETIT_BOUTON} aria-label="Monter la question">
            ↑ Monter
          </button>
          <button type="button" onClick={() => deplacer(1)} disabled={numero === total} className={PETIT_BOUTON} aria-label="Descendre la question">
            ↓ Descendre
          </button>
          <button type="button" onClick={supprimer} disabled={total === 1} className={`${PETIT_BOUTON} text-danger`}>
            Supprimer
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-3">
        <div>
          <label htmlFor={id("libelle")} className={ETIQUETTE}>
            Question
          </label>
          <textarea
            id={id("libelle")}
            rows={2}
            maxLength={500}
            value={question.libelle}
            onChange={(e) => modifier({ libelle: e.target.value })}
            className={CHAMP}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div>
            <label htmlFor={id("type")} className={ETIQUETTE}>
              Forme de la réponse
            </label>
            <select id={id("type")} value={question.type} onChange={(e) => changerType(e.target.value as TypeQuestion)} className={CHAMP}>
              {TYPES_QUESTION.map((t) => (
                <option key={t} value={t}>
                  {LIBELLE_TYPE_QUESTION[t]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5 pb-2">
            <label className="flex cursor-pointer items-center gap-2 text-[12.5px]">
              <input
                type="checkbox"
                checked={Boolean(question.obligatoire)}
                onChange={(e) => modifier({ obligatoire: e.target.checked })}
                className="size-4 accent-[var(--color-accent)]"
              />
              Réponse obligatoire
            </label>
            {satisfaction && question.type === "NOTE" && (
              <label className="flex cursor-pointer items-center gap-2 text-[12.5px]">
                <input
                  type="checkbox"
                  checked={Boolean(question.globale)}
                  onChange={(e) => modifier({ globale: e.target.checked })}
                  className="size-4 accent-[var(--color-accent)]"
                />
                Note de satisfaction générale
              </label>
            )}
          </div>
        </div>

        {estChoix(question.type) && (
          <div>
            <label htmlFor={id("options")} className={ETIQUETTE}>
              Cases proposées <span className="font-normal text-texte-tenu">(une par ligne)</span>
            </label>
            <textarea
              id={id("options")}
              rows={Math.max(3, (question.options?.length ?? 0) + 1)}
              value={(question.options ?? []).join("\n")}
              // Découpage brut, sans nettoyage : les lignes vides restent
              // pendant la saisie, et sont écartées à l'enregistrement.
              onChange={(e) => modifier({ options: e.target.value.split("\n") })}
              className={CHAMP}
            />
          </div>
        )}

        <div>
          <label htmlFor={id("section")} className={ETIQUETTE}>
            Intertitre au-dessus de cette question <span className="font-normal text-texte-tenu">(facultatif)</span>
          </label>
          <input
            id={id("section")}
            maxLength={200}
            value={question.section ?? ""}
            onChange={(e) => modifier({ section: e.target.value })}
            placeholder="Ex. : Vos attentes — ouvre une nouvelle partie du questionnaire"
            className={CHAMP}
          />
        </div>
      </div>
    </li>
  );
}

type Props = { code: CodeQuestionnaire; contenu: ContenuQuestionnaire; modifie: boolean };

export function EditeurQuestionnaire({ code, contenu, modifie }: Props) {
  const [etat, envoyer, enCours] = useActionState<EtatEditeur, FormData>(modifierQuestionnaire, {});
  const [titre, setTitre] = useState(contenu.titre);
  const [introduction, setIntroduction] = useState(contenu.introduction ?? "");
  const [questions, setQuestions] = useState(contenu.questions);
  const [reference, setReference] = useState(() => JSON.stringify(contenu));
  const [estModifie, setEstModifie] = useState(modifie);

  // Après un enregistrement ou un retour à l'origine, l'éditeur s'aligne sur
  // le contenu désormais en vigueur, renvoyé par le serveur.
  const [etatVu, setEtatVu] = useState(etat);
  if (etat !== etatVu) {
    setEtatVu(etat);
    if (etat.contenu) {
      setTitre(etat.contenu.titre);
      setIntroduction(etat.contenu.introduction ?? "");
      setQuestions(etat.contenu.questions);
      setReference(JSON.stringify(etat.contenu));
      setEstModifie(Boolean(etat.modifie));
    }
  }

  const courant: ContenuQuestionnaire = { titre, introduction: introduction || undefined, questions };
  const nonEnregistre = JSON.stringify(courant) !== reference;

  // Quitter la page avec des changements non enregistrés demande confirmation.
  useEffect(() => {
    if (!nonEnregistre) return;
    const retenir = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", retenir);
    return () => window.removeEventListener("beforeunload", retenir);
  }, [nonEnregistre]);

  const modifierQuestion = (index: number, changement: Partial<Question>) =>
    setQuestions((qs) =>
      qs.map((q, i) => {
        if (i === index) return { ...q, ...changement };
        // Une seule note de satisfaction générale : en cocher une décoche les autres.
        return changement.globale ? { ...q, globale: undefined } : q;
      }),
    );

  const deplacer = (index: number, sens: -1 | 1) =>
    setQuestions((qs) => {
      const cible = index + sens;
      if (cible < 0 || cible >= qs.length) return qs;
      const copie = [...qs];
      [copie[index], copie[cible]] = [copie[cible], copie[index]];
      return copie;
    });

  const supprimer = (index: number) => {
    const q = questions[index];
    if (!window.confirm(`Supprimer la question « ${q.libelle || "sans intitulé"} » ? Les réponses déjà reçues sont conservées.`)) return;
    setQuestions((qs) => qs.filter((_, i) => i !== index));
  };

  const ajouter = () =>
    setQuestions((qs) => [...qs, { id: nouvelIdentifiant(qs), type: "CHOIX_UNIQUE", libelle: "", options: ["Oui", "Non"], obligatoire: true }]);

  return (
    <form action={envoyer} className="flex flex-col gap-4">
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="contenu" value={JSON.stringify(courant)} />

      <section className="rounded-xl border border-bordure bg-surface p-4 shadow-sm">
        <div className="flex flex-col gap-3">
          <div>
            <label htmlFor="titre" className={ETIQUETTE}>
              Titre affiché en haut du questionnaire
            </label>
            <input id="titre" maxLength={200} value={titre} onChange={(e) => setTitre(e.target.value)} className={CHAMP} />
          </div>
          <div>
            <label htmlFor="introduction" className={ETIQUETTE}>
              Introduction <span className="font-normal text-texte-tenu">(facultatif — affichée après « Bonjour Prénom, »)</span>
            </label>
            <textarea
              id="introduction"
              rows={2}
              maxLength={2000}
              value={introduction}
              onChange={(e) => setIntroduction(e.target.value)}
              className={CHAMP}
            />
          </div>
        </div>
      </section>

      <ol className="flex flex-col gap-3">
        {questions.map((q, index) => (
          <CarteQuestion
            key={q.id}
            question={q}
            numero={index + 1}
            total={questions.length}
            satisfaction={code === "SATISFACTION"}
            modifier={(changement) => modifierQuestion(index, changement)}
            deplacer={(sens) => deplacer(index, sens)}
            supprimer={() => supprimer(index)}
          />
        ))}
      </ol>

      <button
        type="button"
        onClick={ajouter}
        className="self-start rounded-lg border border-dashed border-accent px-4 py-2 text-[13px] font-semibold text-accent-fort hover:bg-accent-pale"
      >
        + Ajouter une question
      </button>

      <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-bordure bg-surface px-4 py-3 shadow-md">
        <button
          type="submit"
          name="operation"
          value="enregistrer"
          disabled={enCours || !nonEnregistre}
          className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:bg-accent-fort disabled:opacity-50 disabled:hover:bg-accent"
        >
          {enCours ? "Enregistrement…" : "Enregistrer"}
        </button>
        <Link
          href={`/questionnaires/modeles/${code}/apercu`}
          target="_blank"
          className="rounded-lg border border-bordure px-3 py-2 text-[13px] font-semibold text-texte-doux hover:bg-surface-creuse"
        >
          Aperçu
        </Link>
        <p role="status" className="min-w-0 flex-1 text-[12.5px]">
          {etat.erreur ? (
            <span className="font-semibold text-danger">{etat.erreur}</span>
          ) : nonEnregistre ? (
            <span className="text-alerte">Modifications non enregistrées. L&apos;aperçu montre la version enregistrée.</span>
          ) : etat.succes ? (
            <span className="font-semibold text-succes">{etat.succes}</span>
          ) : null}
        </p>
        {estModifie && (
          <button
            type="submit"
            name="operation"
            value="retablir"
            disabled={enCours}
            onClick={(e) => {
              if (!window.confirm("Revenir au questionnaire d'origine ? Vos modifications seront perdues ; les réponses déjà reçues sont conservées.")) {
                e.preventDefault();
              }
            }}
            className="text-[12.5px] font-semibold text-texte-doux underline hover:text-danger"
          >
            Revenir au questionnaire d&apos;origine
          </button>
        )}
      </div>
    </form>
  );
}
