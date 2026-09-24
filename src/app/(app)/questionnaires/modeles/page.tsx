import Link from "next/link";

import { lireContenuQuestionnaire } from "@/lib/questionnaires-modeles";
import { CODES_QUESTIONNAIRE, LIBELLE_QUESTIONNAIRE } from "@/lib/questionnaires-questions";
import { exigerRole } from "@/lib/session";

export const dynamic = "force-dynamic";

const jour = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Paris" });

export default async function PageModelesQuestionnaires() {
  await exigerRole("ADMIN", "GESTIONNAIRE");
  const questionnaires = await Promise.all(
    CODES_QUESTIONNAIRE.map(async (code) => ({ code, ...(await lireContenuQuestionnaire(code)) })),
  );

  return (
    <>
      <header className="mb-6">
        <Link href="/questionnaires" className="text-[12.5px] font-semibold text-accent-fort hover:underline">
          ← Questionnaires
        </Link>
        <h1 className="mt-2 text-[22px] font-extrabold tracking-tight">Modifier les questionnaires</h1>
        <p className="mt-1 max-w-3xl text-[12.8px] text-texte-doux">
          Le contenu de chaque questionnaire en ligne : titre, introduction et questions. Une modification vaut pour tous
          les questionnaires remplis ensuite ; les réponses déjà reçues gardent les questions telles qu&apos;elles ont été
          posées.
        </p>
      </header>

      <ul className="grid gap-3 md:grid-cols-2">
        {questionnaires.map(({ code, contenu, modifieLe }) => (
          <li key={code} className="flex flex-col rounded-xl border border-bordure bg-surface p-4 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-wider text-texte-tenu">{LIBELLE_QUESTIONNAIRE[code]}</p>
            <p className="mt-1 text-[14.5px] font-bold">{contenu.titre}</p>
            <p className="mt-1 text-[12px] text-texte-doux">
              {contenu.questions.length} question{contenu.questions.length > 1 ? "s" : ""} ·{" "}
              {modifieLe ? `modifié le ${jour.format(modifieLe)}` : "version d'origine"}
            </p>
            <div className="mt-3 flex gap-2 pt-1">
              <Link
                href={`/questionnaires/modeles/${code}`}
                className="rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-accent-fort"
              >
                Modifier
              </Link>
              <Link
                href={`/questionnaires/modeles/${code}/apercu`}
                className="rounded-lg border border-bordure px-3 py-1.5 text-[12.5px] font-semibold text-texte-doux hover:bg-surface-creuse"
              >
                Aperçu
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
