import type { TypeQuestionnaire } from "@prisma/client";

import { questionsPosees } from "@/lib/questionnaires-modeles";
import {
  LIBELLE_TYPE_QUESTIONNAIRE,
  texteReponse,
  type Question,
  type ReponsesQuestionnaire,
} from "@/lib/questionnaires-questions";

/// Ce qu'une fiche doit charger pour afficher les réponses : à passer tel
/// quel à `include` dans la requête Prisma.
export const SELECTION_REPONSES = {
  where: { reponduAt: { not: null } },
  orderBy: { reponduAt: "desc" },
  include: { session: { select: { numero: true, formation: { select: { titre: true } } } } },
} as const;

export type QuestionnaireRepondu = {
  id: string;
  type: TypeQuestionnaire;
  reponduAt: Date | null;
  reponses: unknown;
  questions: unknown;
  session: { numero: string; formation: { titre: string } } | null;
};

const jour = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Paris" });

/// Réponses d'un destinataire, question par question, avec les intertitres
/// du questionnaire tel qu'il lui a été posé.
export function DetailReponses({ questions, reponses }: { questions: Question[]; reponses: unknown }) {
  const valeurs = (reponses ?? {}) as ReponsesQuestionnaire;
  return (
    <dl className="flex flex-col gap-1.5">
      {questions.map((question) => {
        const texte = texteReponse(question, valeurs[question.id]);
        return (
          <div key={question.id} className="grid gap-0.5 sm:grid-cols-[1fr_auto] sm:gap-4">
            {question.section && (
              <p className="pt-1.5 text-[11px] font-bold uppercase tracking-wider text-texte-tenu sm:col-span-2">{question.section}</p>
            )}
            <dt className="text-[12.5px] text-texte-doux">{question.libelle}</dt>
            <dd className="text-[12.5px] sm:max-w-[26rem] sm:text-right">
              {texte ? <span className="whitespace-pre-line font-semibold">{texte}</span> : <span className="text-texte-tenu">—</span>}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/// Réponses aux questionnaires qualité, telles qu'elles apparaissent sur la
/// fiche d'un apprenant, d'un formateur ou d'un dossier de financement.
export function ReponsesQuestionnaires({ questionnaires }: { questionnaires: QuestionnaireRepondu[] }) {
  if (questionnaires.length === 0) return null;

  return (
    <section className="mt-4 rounded-xl border border-bordure bg-surface p-5 shadow-sm">
      <h2 className="mb-3 text-[14.5px] font-bold">
        Réponses aux questionnaires <span className="font-normal text-texte-tenu">({questionnaires.length})</span>
      </h2>
      <div className="flex flex-col gap-4">
        {questionnaires.map((q) => (
          <article key={q.id} className="border-t border-bordure-douce pt-3 first:border-t-0 first:pt-0">
            <p className="text-[13px] font-semibold">{LIBELLE_TYPE_QUESTIONNAIRE[q.type]}</p>
            <p className="mb-2 text-[11.5px] text-texte-tenu">
              {q.session && `${q.session.numero} — ${q.session.formation.titre} · `}
              répondu le {q.reponduAt ? jour.format(q.reponduAt) : "—"}
            </p>
            <DetailReponses questions={questionsPosees(q.questions, q.type)} reponses={q.reponses} />
          </article>
        ))}
      </div>
    </section>
  );
}
