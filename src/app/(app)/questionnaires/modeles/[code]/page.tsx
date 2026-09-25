import Link from "next/link";
import { notFound } from "next/navigation";

import { EditeurQuestionnaire } from "@/app/(app)/questionnaires/modeles/[code]/editeur";
import { lireContenuQuestionnaire } from "@/lib/questionnaires-modeles";
import { estCodeQuestionnaire, LIBELLE_QUESTIONNAIRE } from "@/lib/questionnaires-questions";
import { exigerRole } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function PageEditeurQuestionnaire({ params }: { params: Promise<{ code: string }> }) {
  await exigerRole("ADMIN", "GESTIONNAIRE");
  const { code } = await params;
  if (!estCodeQuestionnaire(code)) notFound();
  const { contenu, modifieLe } = await lireContenuQuestionnaire(code);

  return (
    <>
      <header className="mb-5">
        <Link href="/questionnaires/modeles" className="text-[12.5px] font-semibold text-accent-fort hover:underline">
          ← Tous les questionnaires
        </Link>
        <h1 className="mt-2 text-[22px] font-extrabold tracking-tight">{LIBELLE_QUESTIONNAIRE[code]}</h1>
        <p className="mt-1 max-w-3xl text-[12.8px] text-texte-doux">
          Chaque question se répond en cochant des cases, sauf la réponse libre. Reformuler une question conserve son
          historique dans les statistiques ; la supprimer ne supprime aucune réponse déjà reçue.
        </p>
        {code === "CHAUD_FORMATEUR" && (
          <p className="mt-2 max-w-3xl rounded-lg bg-accent-pale px-3 py-2 text-[12.5px] text-accent-fort">
            L&apos;évaluation des acquis de chaque apprenant (acquis, partiellement acquis, non acquis) s&apos;ajoute
            toujours à la fin de ce questionnaire : elle figure sur les attestations et ne se retire pas.
          </p>
        )}
      </header>
      <EditeurQuestionnaire code={code} contenu={contenu} modifie={modifieLe !== null} />
    </>
  );
}
