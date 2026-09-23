import type { TypeQuestionnaire } from "@prisma/client";

import {
  LIBELLE_TYPE_QUESTIONNAIRE,
  QUESTIONS_QUESTIONNAIRE,
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
  session: { numero: string; formation: { titre: string } } | null;
};

const jour = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Paris" });

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
        {questionnaires.map((q) => {
          const reponses = (q.reponses ?? {}) as ReponsesQuestionnaire;
          return (
            <article key={q.id} className="border-t border-bordure-douce pt-3 first:border-t-0 first:pt-0">
              <p className="text-[13px] font-semibold">{LIBELLE_TYPE_QUESTIONNAIRE[q.type]}</p>
              <p className="mb-2 text-[11.5px] text-texte-tenu">
                {q.session && `${q.session.numero} — ${q.session.formation.titre} · `}
                répondu le {q.reponduAt ? jour.format(q.reponduAt) : "—"}
              </p>
              <dl className="flex flex-col gap-1">
                {QUESTIONS_QUESTIONNAIRE[q.type].map((question) => {
                  const valeur = reponses[question.code];
                  return (
                    <div key={question.code} className="grid gap-0.5 sm:grid-cols-[1fr_auto] sm:gap-4">
                      <dt className="text-[12.5px] text-texte-doux">{question.libelle}</dt>
                      <dd className="text-[12.5px] sm:text-right">
                        {question.type === "CASE" ? (
                          <span className={valeur ? "font-semibold text-succes" : "text-texte-tenu"}>
                            {valeur ? "Oui" : "Non"}
                          </span>
                        ) : typeof valeur === "string" && valeur ? (
                          <span className="whitespace-pre-line">{valeur}</span>
                        ) : (
                          <span className="text-texte-tenu">—</span>
                        )}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </article>
          );
        })}
      </div>
    </section>
  );
}
