import Link from "next/link";
import { notFound } from "next/navigation";

import { EnTeteQuestionnaire } from "@/app/_composants/en-tete-questionnaire";
import { FormulaireQuestionnaire } from "@/app/_composants/formulaire-questionnaire";
import { lireContenuQuestionnaire } from "@/lib/questionnaires-modeles";
import { estCodeQuestionnaire, TYPES_LIES_A_UNE_SESSION, type CodeQuestionnaire } from "@/lib/questionnaires-questions";
import { exigerRole } from "@/lib/session";

export const dynamic = "force-dynamic";

const LIE_A_UNE_SESSION = (code: CodeQuestionnaire) =>
  code === "SATISFACTION" || (TYPES_LIES_A_UNE_SESSION as CodeQuestionnaire[]).includes(code);

/// Le questionnaire tel que le destinataire le verra, dans sa version
/// enregistrée. L'envoi des réponses y est désactivé.
export default async function PageApercuQuestionnaire({ params }: { params: Promise<{ code: string }> }) {
  await exigerRole("ADMIN", "GESTIONNAIRE");
  const { code } = await params;
  if (!estCodeQuestionnaire(code)) notFound();
  const { contenu } = await lireContenuQuestionnaire(code);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-accent-pale px-4 py-3 text-[12.5px] text-accent-fort">
        <span>
          <strong>Aperçu</strong> de la version enregistrée, tel que le destinataire la verra. Les réponses ne sont pas
          enregistrées.
        </span>
        <Link href={`/questionnaires/modeles/${code}`} className="font-semibold underline">
          Modifier ce questionnaire
        </Link>
      </div>
      <div className="mx-auto w-full max-w-2xl">
        <EnTeteQuestionnaire
          titre={contenu.titre}
          contexte={LIE_A_UNE_SESSION(code) ? "« Intitulé de la formation » — dates de la session" : undefined}
          prenom="Prénom"
          introduction={contenu.introduction}
        />
        <FormulaireQuestionnaire
          questions={contenu.questions}
          evaluation={
            code === "CHAUD_FORMATEUR"
              ? {
                  apprenants: [
                    { id: "exemple-1", nom: "Premier apprenant (exemple)" },
                    { id: "exemple-2", nom: "Second apprenant (exemple)" },
                  ],
                  existantes: {},
                }
              : undefined
          }
        />
      </div>
    </>
  );
}
