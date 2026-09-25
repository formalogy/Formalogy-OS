"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";

import { modifierQuestionnaire, type EtatEditeur } from "@/app/(app)/questionnaires/modeles/actions";
import {
  AVEC_OPTIONS,
  echelle,
  estEchelleParDefaut,
  LIBELLE_TYPE_QUESTION,
  NOTE_BORNE_MAX,
  NOTE_BORNE_MIN,
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

/// Identifiant d'une nouvelle question : court, et distinct de tous ceux du
/// questionnaire, pour que ses réponses ne se mêlent jamais à une autre.
function nouvelIdentifiant(questions: Question[]): string {
  const pris = new Set(questions.map((q) => q.id));
  let id: string;
  do id = `q_${Math.random().toString(36).slice(2, 8)}`;
  while (pris.has(id));
  return id;
}

/// Icône de chaque forme de réponse, dans le menu comme sur son bouton.
function IconeType({ type }: { type: TypeQuestion }) {
  const commun = { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.5, "aria-hidden": true };
  if (type === "CHOIX_UNIQUE")
    return (
      <svg {...commun}>
        <circle cx="8" cy="8" r="6" />
        <circle cx="8" cy="8" r="2.6" fill="currentColor" stroke="none" />
      </svg>
    );
  if (type === "CHOIX_MULTIPLE")
    return (
      <svg {...commun}>
        <rect x="4.5" y="4.5" width="9" height="9" rx="1.5" />
        <path d="M2.5 11V3.5A1 1 0 0 1 3.5 2.5H11" />
        <path d="M6.8 9l1.6 1.6 3-3.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (type === "TEXTE")
    return (
      <svg {...commun} strokeLinecap="round">
        <path d="M2.5 4.5h11M2.5 8h8M2.5 11.5h5" />
      </svg>
    );
  if (type === "CLASSEMENT")
    return (
      <svg {...commun} strokeLinecap="round">
        <path d="M7 4.5h6.5M7 8h6.5M7 11.5h6.5" />
        <path d="M2.6 3.4l1-.7v3.2M2.4 9.2c.3-.5 1.8-.6 1.8.3 0 .7-1.8 1.4-1.8 2.3h1.9" strokeWidth={1.2} strokeLinejoin="round" />
      </svg>
    );
  return (
    <svg {...commun}>
      <rect x="2.5" y="2.5" width="11" height="11" rx="2" />
      <path d="M5.3 8.2l1.9 1.9 3.6-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/// Menu de la forme de réponse, à droite de la question.
function MenuType({ valeur, onChange }: { valeur: TypeQuestion; onChange: (type: TypeQuestion) => void }) {
  const [ouvert, setOuvert] = useState(false);
  const cadre = useRef<HTMLDivElement>(null);

  // Un clic ailleurs ou la touche Échap referment le menu.
  useEffect(() => {
    if (!ouvert) return;
    const clic = (e: MouseEvent) => {
      if (!cadre.current?.contains(e.target as Node)) setOuvert(false);
    };
    const touche = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOuvert(false);
    };
    document.addEventListener("mousedown", clic);
    document.addEventListener("keydown", touche);
    return () => {
      document.removeEventListener("mousedown", clic);
      document.removeEventListener("keydown", touche);
    };
  }, [ouvert]);

  return (
    <div ref={cadre} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={ouvert}
        onClick={() => setOuvert((o) => !o)}
        className="flex items-center gap-2 rounded-full border border-bordure bg-surface px-3 py-1.5 text-[12.5px] font-semibold hover:bg-surface-creuse"
      >
        <IconeType type={valeur} />
        {LIBELLE_TYPE_QUESTION[valeur]}
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
          <path d="M3 4.5l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {ouvert && (
        <ul role="listbox" aria-label="Forme de la réponse" className="absolute right-0 z-20 mt-1.5 w-64 overflow-hidden rounded-xl border border-bordure bg-surface shadow-lg">
          {TYPES_QUESTION.map((type) => (
            <li key={type} role="option" aria-selected={type === valeur} className="border-t border-bordure-douce first:border-t-0">
              <button
                type="button"
                onClick={() => {
                  onChange(type);
                  setOuvert(false);
                }}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[13.5px] hover:bg-surface-creuse"
              >
                <IconeType type={type} />
                <span className="flex-1">{LIBELLE_TYPE_QUESTION[type]}</span>
                {type === valeur && (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
                    <path d="M2.5 7.5l3 3 6-6.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
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
  const [avecDescription, setAvecDescription] = useState(Boolean(question.description));
  const avecOptions = AVEC_OPTIONS.includes(question.type);
  const { min, max } = echelle(question);

  function changerType(type: TypeQuestion) {
    // Une question qui passe à des cases ou à un classement reçoit un point
    // de départ plutôt qu'une liste vide ; ses éléments sont conservés sinon.
    const vide = !(question.options ?? []).some((o) => o.trim());
    const options =
      AVEC_OPTIONS.includes(type) && vide ? (type === "CLASSEMENT" ? ["Premier élément", "Deuxième élément"] : ["Oui", "Non"]) : question.options;
    modifier({ type, options, globale: type === "NOTE" ? question.globale : undefined });
  }

  return (
    <li className="rounded-xl border border-bordure bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="rounded-full border border-bordure px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-texte-tenu">
          Question {numero}
        </span>
        <MenuType valeur={question.type} onChange={changerType} />
      </div>

      <div className="mt-3 flex flex-col gap-3">
        <div>
          <label htmlFor={id("libelle")} className="sr-only">
            Question
          </label>
          <textarea
            id={id("libelle")}
            rows={2}
            maxLength={500}
            value={question.libelle}
            onChange={(e) => modifier({ libelle: e.target.value })}
            placeholder="Intitulé de la question"
            className="w-full rounded-lg border border-bordure bg-surface px-3 py-2 text-[15px] font-bold outline-none focus:border-accent focus:ring-2 focus:ring-accent-pale"
          />
          {avecDescription ? (
            <div className="mt-2">
              <label htmlFor={id("description")} className={ETIQUETTE}>
                Description <span className="font-normal text-texte-tenu">(sous la question)</span>
              </label>
              <textarea
                id={id("description")}
                rows={2}
                maxLength={1000}
                value={question.description ?? ""}
                onChange={(e) => modifier({ description: e.target.value })}
                placeholder="Précision, consigne ou exemple"
                className={CHAMP}
              />
              <button
                type="button"
                onClick={() => {
                  setAvecDescription(false);
                  modifier({ description: undefined });
                }}
                className="mt-1 text-[11.5px] font-semibold text-texte-tenu hover:text-danger hover:underline"
              >
                Retirer la description
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAvecDescription(true)}
              className="mt-2 flex items-center gap-1.5 text-[12.5px] font-semibold text-texte-doux hover:text-accent-fort"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
                <rect x="5.5" y="3.5" width="8" height="9" rx="1.5" />
                <path d="M2.5 3v10M1.5 3h2M1.5 13h2M7.8 7h3.4M7.8 9.5h2.2" strokeLinecap="round" />
              </svg>
              Ajouter une description
            </button>
          )}
        </div>

        {avecOptions && (
          <div>
            <label htmlFor={id("options")} className={ETIQUETTE}>
              {question.type === "CLASSEMENT" ? "Éléments à classer" : "Cases proposées"}{" "}
              <span className="font-normal text-texte-tenu">(un par ligne)</span>
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

        {question.type === "NOTE" && (
          <div>
            <span className={ETIQUETTE}>Échelle de la note</span>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[13px]">
              de
              <input
                type="number"
                min={NOTE_BORNE_MIN}
                max={NOTE_BORNE_MAX}
                value={min}
                onChange={(e) => modifier({ min: Number(e.target.value) })}
                aria-label="Note minimale"
                className="w-16 rounded-lg border border-bordure bg-surface px-2 py-1.5 text-center font-mono outline-none focus:border-accent focus:ring-2 focus:ring-accent-pale"
              />
              à
              <input
                type="number"
                min={NOTE_BORNE_MIN}
                max={NOTE_BORNE_MAX}
                value={max}
                onChange={(e) => modifier({ max: Number(e.target.value) })}
                aria-label="Note maximale"
                className="w-16 rounded-lg border border-bordure bg-surface px-2 py-1.5 text-center font-mono outline-none focus:border-accent focus:ring-2 focus:ring-accent-pale"
              />
              <span className="text-[12px] text-texte-tenu">
                {estEchelleParDefaut(question)
                  ? "cases de « Pas du tout » à « Tout à fait »"
                  : `${max - min + 1} cases numérotées, de ${NOTE_BORNE_MIN} à ${NOTE_BORNE_MAX} au plus`}
              </span>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-x-5 gap-y-1.5">
          {question.type !== "CLASSEMENT" && (
            <label className="flex cursor-pointer items-center gap-2 text-[12.5px]">
              <input
                type="checkbox"
                checked={Boolean(question.obligatoire)}
                onChange={(e) => modifier({ obligatoire: e.target.checked })}
                className="size-4 accent-[var(--color-accent)]"
              />
              Réponse obligatoire
            </label>
          )}
          {satisfaction && question.type === "NOTE" && (
            <label className={`flex items-center gap-2 text-[12.5px] ${estEchelleParDefaut(question) ? "cursor-pointer" : "text-texte-tenu"}`}>
              <input
                type="checkbox"
                checked={Boolean(question.globale)}
                disabled={!estEchelleParDefaut(question)}
                onChange={(e) => modifier({ globale: e.target.checked })}
                className="size-4 accent-[var(--color-accent)]"
              />
              Note de satisfaction générale {!estEchelleParDefaut(question) && "(échelle de 1 à 5 seulement)"}
            </label>
          )}
        </div>

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

        <div className="flex flex-wrap justify-end gap-1.5 border-t border-bordure-douce pt-3">
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
