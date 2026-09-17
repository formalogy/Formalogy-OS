import Link from "next/link";
import { notFound } from "next/navigation";

import { EvaluationAcquis } from "@/app/(app)/_composants/evaluation-acquis";
import { sessionPourEmargement } from "@/lib/emargement-acces";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";
import { aujourdhuiUTC, formaterPeriode } from "@/lib/sessions-libelles";

export const dynamic = "force-dynamic";

/// Le formateur saisit l'évaluation des acquis de ses apprenants.
export default async function PageMesEvaluations({ params }: { params: Promise<{ id: string }> }) {
  const utilisateur = await exigerRole("FORMATEUR");
  const { id } = await params;
  const session = await sessionPourEmargement(utilisateur, id);
  if (!session) notFound();

  const evaluations = await prisma.evaluationAcquis.findMany({ where: { sessionId: session.id } });
  const commencee = session.dateDebut <= aujourdhuiUTC();

  return (
    <>
      <header className="mb-5">
        <Link href={`/mes-sessions/${session.id}`} className="text-[12.5px] font-semibold text-accent-fort hover:underline">
          ← {session.numero}
        </Link>
        <h1 className="mt-2 text-[22px] font-extrabold tracking-tight">Évaluation des acquis</h1>
        <p className="mt-1 text-[12.5px] text-texte-doux">
          {session.formation.titre} · {formaterPeriode(session.dateDebut, session.dateFin)}
        </p>
      </header>

      {!commencee && (
        <p className="mb-4 rounded-lg bg-surface-creuse px-3 py-2 text-[12.5px] text-texte-doux">La saisie sera possible dès le début de la session.</p>
      )}

      <section className="overflow-hidden rounded-xl border border-bordure bg-surface shadow-sm">
        {session.inscriptions.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-texte-doux">Aucun apprenant inscrit.</p>
        ) : (
          <ul>
            {session.inscriptions.map(({ learner }) => {
              const e = evaluations.find((x) => x.learnerId === learner.id);
              return (
                <li key={learner.id} className="border-t border-bordure-douce px-4 py-3 first:border-t-0">
                  <div className="mb-2 text-[13.5px] font-semibold">
                    {learner.prenom} {learner.nom}
                  </div>
                  <EvaluationAcquis sessionId={session.id} learnerId={learner.id} resultat={e?.resultat} commentaire={e?.commentaire} modifiable={commencee} />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
