import Link from "next/link";
import { notFound } from "next/navigation";

import { EvaluationAcquis } from "@/app/(app)/_composants/evaluation-acquis";
import { EnvoiQuestionnaires, GenerationAttestations } from "@/app/(app)/sessions/[id]/fin-de-formation/generation";
import { bilanFinDeFormation, chargerFinDeFormation } from "@/lib/fin-de-formation";
import { lireOrganisme, manquesOrganisme } from "@/lib/organisme";
import { notesDetaillees, questionsPosees } from "@/lib/questionnaires-modeles";
import { echelle, texteReponse, type ReponsesQuestionnaire } from "@/lib/questionnaires-questions";
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
  // Les plus récentes d'abord : si le questionnaire a été modifié entre deux
  // réponses, c'est l'intitulé le plus récent de chaque note qui s'affiche.
  const reponses = session.satisfactions
    .filter((q) => q.reponduAt)
    .sort((a, b) => b.reponduAt!.getTime() - a.reponduAt!.getTime());
  const notes = notesDetaillees(reponses.map((q) => q.questions), "SATISFACTION");
  const globales = reponses.map((q) => q.noteGlobale).filter((n): n is number => n !== null);
  const moyenne = globales.length ? globales.reduce((t, n) => t + n, 0) / globales.length : null;

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
        <div className="flex flex-col items-end gap-2">
          <GenerationAttestations sessionId={session.id} desactive={bilan.blocagesSession.length > 0 || prets === 0} />
          <EnvoiQuestionnaires sessionId={session.id} desactive={session.dateFin > aujourdhuiUTC() || session.inscriptions.length === 0} />
        </div>
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

      <p className="mb-3 rounded-lg border border-bordure bg-surface px-4 py-2.5 text-[12.5px] text-texte-doux shadow-sm">
        <strong className="text-texte">Satisfaction :</strong>{" "}
        {session.satisfactions.length === 0
          ? "questionnaires pas encore envoyés."
          : `${reponses.length} réponse(s) sur ${session.satisfactions.length} envoi(s)${moyenne !== null ? ` · note globale moyenne ${moyenne.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} / 5` : ""}.`}
      </p>

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
                  <div className="flex flex-wrap gap-3 text-[12px]">
                    {(() => {
                      const q = session.satisfactions.find((x) => x.learnerId === a.learnerId);
                      if (!q) return <span className="text-texte-tenu">Questionnaire non envoyé</span>;
                      if (q.reponduAt) return <span className="font-semibold text-succes">Satisfaction {q.noteGlobale} / 5</span>;
                      return <span className="text-texte-tenu">Questionnaire envoyé, sans réponse</span>;
                    })()}
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

      {reponses.length > 0 && (
        <section className="mt-4 overflow-hidden rounded-xl border border-bordure bg-surface shadow-sm">
          <h2 className="border-b border-bordure-douce px-4 py-3 text-[14.5px] font-bold">Réponses au questionnaire de satisfaction</h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12.5px]">
              <thead>
                <tr className="bg-surface-creuse text-left text-[10.5px] uppercase tracking-wider text-texte-tenu">
                  <th className="px-4 py-2 font-semibold">Apprenant</th>
                  {notes.map((q, i) => (
                    <th key={q.id} title={q.libelle} className="whitespace-nowrap px-2 py-2 text-center font-semibold">
                      Q{i + 1}
                    </th>
                  ))}
                  <th className="px-2 py-2 text-center font-semibold">Global</th>
                  <th className="px-4 py-2 font-semibold">Autres réponses</th>
                </tr>
              </thead>
              <tbody>
                {reponses.map((q) => {
                  const r = (q.reponses ?? {}) as ReponsesQuestionnaire;
                  const nom = bilan.apprenants.find((a) => a.learnerId === q.learnerId)?.nom ?? "—";
                  const autres = questionsPosees(q.questions, "SATISFACTION")
                    .filter((question) => question.type !== "NOTE")
                    .map((question) => ({ question, texte: texteReponse(question, r[question.id]) }))
                    .filter((x) => x.texte);
                  return (
                    <tr key={q.learnerId} className="border-t border-bordure-douce align-top">
                      <td className="whitespace-nowrap px-4 py-2 font-semibold">{nom}</td>
                      {notes.map((question) => (
                        <td key={question.id} className="px-2 py-2 text-center font-mono tabular-nums">
                          {typeof r[question.id] === "number" ? String(r[question.id]) : "—"}
                        </td>
                      ))}
                      <td className="px-2 py-2 text-center font-mono font-semibold tabular-nums">{q.noteGlobale ?? "—"}</td>
                      <td className="px-4 py-2 text-texte-doux">
                        {autres.map(({ question, texte }) => (
                          <p key={question.id} className="whitespace-pre-line">
                            <span className="font-semibold text-texte">{question.libelle} :</span> {texte}
                          </p>
                        ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {notes.length > 0 && (
            <ol className="border-t border-bordure-douce px-4 py-3 text-[11.5px] text-texte-doux">
              {notes.map((q, i) => (
                <li key={q.id}>
                  <span className="font-semibold">Q{i + 1}</span> — {q.libelle}{" "}
                  <span className="text-texte-tenu">
                    (note de {echelle(q).min} à {echelle(q).max})
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </>
  );
}
