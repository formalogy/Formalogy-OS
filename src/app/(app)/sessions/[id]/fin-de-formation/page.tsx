import Link from "next/link";
import { notFound } from "next/navigation";

import { EvaluationAcquis } from "@/app/(app)/_composants/evaluation-acquis";
import { GenerationAttestations } from "@/app/(app)/sessions/[id]/fin-de-formation/generation";
import { bilanFinDeFormation, chargerFinDeFormation } from "@/lib/fin-de-formation";
import { lireOrganisme, manquesOrganisme } from "@/lib/organisme";
import { exigerRole } from "@/lib/session";
import { aujourdhuiUTC, formaterPeriode } from "@/lib/sessions-libelles";

export const dynamic = "force-dynamic";

const heures = (h: number) => `${h.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} h`;

export default async function PageFinDeFormation({ params }: { params: Promise<{ id: string }> }) {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");
  const { id } = await params;
  const [session, organisme] = await Promise.all([chargerFinDeFormation(id), lireOrganisme()]);
  if (!session) notFound();

  const bilan = bilanFinDeFormation(session, manquesOrganisme(organisme));
  const commencee = session.dateDebut <= aujourdhuiUTC();
  const prets = bilan.apprenants.filter((a) => a.blocages.length === 0).length;

  return (
    <>
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/sessions/${session.id}`} className="text-[12.5px] font-semibold text-accent-fort hover:underline">
            ← {session.numero}
          </Link>
          <h1 className="mt-2 text-[22px] font-extrabold tracking-tight">Fin de formation</h1>
          <p className="mt-1 text-[12.5px] text-texte-doux">
            {session.formation.titre} · {formaterPeriode(session.dateDebut, session.dateFin)}
            {bilan.heuresPrevues !== null && ` · ${heures(bilan.heuresPrevues)} prévues`}
          </p>
        </div>
        <GenerationAttestations sessionId={session.id} desactive={bilan.blocagesSession.length > 0 || prets === 0} />
      </header>

      {bilan.blocagesSession.length > 0 && (
        <div className="mb-4 rounded-lg bg-alerte/12 px-4 py-3 text-[12.5px] text-alerte">
          <p className="font-semibold">Avant de générer les documents :</p>
          <ul className="ml-4 list-disc">
            {bilan.blocagesSession.map((b) => (
              <li key={b}>
                {b}
                {b.startsWith("informations de l'organisme") && (
                  <>
                    {" "}—{" "}
                    <Link href="/parametres/organisme" className="font-semibold underline">compléter</Link>
                  </>
                )}
                {b.startsWith("la durée en heures") && (
                  <>
                    {" "}—{" "}
                    <Link href={`/formations`} className="font-semibold underline">voir le catalogue</Link>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mb-3 text-[12.5px] text-texte-doux">
        Pour chaque apprenant : présences saisies (
        <Link href={`/sessions/${session.id}/emargement`} className="font-semibold text-accent-fort hover:underline">émargement</Link>
        ) et évaluation des acquis. Les heures suivies sont calculées au prorata des demi-journées de présence.
      </p>

      <section className="overflow-hidden rounded-xl border border-bordure bg-surface shadow-sm">
        {bilan.apprenants.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-texte-doux">Aucun apprenant inscrit.</p>
        ) : (
          <ul>
            {bilan.apprenants.map((a) => (
              <li key={a.learnerId} className="border-t border-bordure-douce px-4 py-3 first:border-t-0">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <Link href={`/apprenants/${a.learnerId}`} className="text-[13.5px] font-semibold hover:text-accent-fort">
                      {a.nom}
                    </Link>
                    <span className="ml-2 text-[12px] text-texte-tenu">
                      {a.demiJourneesPresent} / {bilan.demiJourneesTotal} demi-journées
                      {a.heures !== null && ` · ${heures(a.heures)} suivies`}
                    </span>
                  </div>
                  <div className="flex gap-3 text-[12px]">
                    {a.attestationId ? (
                      <Link href={`/documents/${a.attestationId}`} className="font-semibold text-accent-fort hover:underline">Attestation</Link>
                    ) : (
                      <span className="text-texte-tenu">Pas d&apos;attestation</span>
                    )}
                    {a.certificatId && (
                      <Link href={`/documents/${a.certificatId}`} className="font-semibold text-accent-fort hover:underline">Certificat</Link>
                    )}
                  </div>
                </div>
                <EvaluationAcquis
                  sessionId={session.id}
                  learnerId={a.learnerId}
                  resultat={a.evaluation?.resultat}
                  commentaire={a.evaluation?.commentaire}
                  modifiable={commencee && utilisateur.role !== "FORMATEUR"}
                />
                {a.blocages.length > 0 && <p className="mt-1.5 text-[11.5px] text-alerte">À compléter : {a.blocages.join(", ")}.</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
