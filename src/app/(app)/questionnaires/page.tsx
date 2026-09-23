import type { TypeQuestionnaire } from "@prisma/client";
import Link from "next/link";

import { EnvoiQuestionnaire, type SessionEnvoi } from "@/app/(app)/questionnaires/envoi";
import { prisma } from "@/lib/prisma";
import {
  LIBELLE_TYPE_QUESTIONNAIRE,
  QUESTIONS_QUESTIONNAIRE,
  type ReponsesQuestionnaire,
} from "@/lib/questionnaires-questions";
import { exigerRole } from "@/lib/session";
import { formaterPeriode } from "@/lib/sessions-libelles";

export const dynamic = "force-dynamic";

const TYPES: TypeQuestionnaire[] = ["POSITIONNEMENT", "FROID", "CHAUD_FORMATEUR", "FINANCEUR", "SATISFACTION_FORMATEUR"];

const jour = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Paris" });

export default async function PageQuestionnaires({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  await exigerRole("ADMIN", "GESTIONNAIRE");
  const params = await searchParams;
  const filtre = TYPES.includes(params.type as TypeQuestionnaire) ? (params.type as TypeQuestionnaire) : undefined;

  const [envoyes, sessions, formateurs, dossiers] = await Promise.all([
    prisma.questionnaire.findMany({
      where: filtre ? { type: filtre } : {},
      orderBy: [{ reponduAt: { sort: "desc", nulls: "last" } }, { envoyeAt: "desc" }],
      take: 200,
      include: {
        learner: { select: { id: true, prenom: true, nom: true } },
        trainer: { select: { id: true, prenom: true, nom: true } },
        dossier: { select: { id: true, financeurNom: true, reference: true } },
        session: { select: { id: true, numero: true, formation: { select: { titre: true } } } },
      },
    }),
    // Les brouillons ne concernent encore personne : rien à leur envoyer.
    prisma.trainingSession.findMany({
      where: { deletedAt: null, statut: { not: "BROUILLON" } },
      orderBy: { dateDebut: "desc" },
      take: 100,
      select: {
        id: true,
        numero: true,
        dateDebut: true,
        dateFin: true,
        formation: { select: { titre: true } },
        trainer: { select: { id: true, prenom: true, nom: true } },
        inscriptions: {
          select: { learner: { select: { id: true, prenom: true, nom: true } } },
          orderBy: { learner: { nom: "asc" } },
        },
      },
    }),
    prisma.trainer.findMany({ where: { deletedAt: null, actif: true }, orderBy: { nom: "asc" }, select: { id: true, prenom: true, nom: true } }),
    prisma.dossierFinancement.findMany({ orderBy: { createdAt: "desc" }, take: 100, select: { id: true, financeurNom: true, reference: true } }),
  ]);

  const sessionsEnvoi: SessionEnvoi[] = sessions.map((s) => ({
    id: s.id,
    libelle: `${s.numero} — ${s.formation.titre} (${formaterPeriode(s.dateDebut, s.dateFin)})`,
    trainerId: s.trainer?.id ?? null,
    trainerNom: s.trainer ? `${s.trainer.prenom} ${s.trainer.nom}` : null,
    apprenants: s.inscriptions.map((i) => ({ id: i.learner.id, libelle: `${i.learner.prenom} ${i.learner.nom}` })),
  }));

  return (
    <>
      <header className="mb-6">
        <h1 className="text-[22px] font-extrabold tracking-tight">Questionnaires</h1>
        <p className="mt-1 text-[12.8px] text-texte-doux">
          Positionnement, à froid, retours des formateurs et des financeurs. Le questionnaire de satisfaction à chaud des
          apprenants se suit depuis la session concernée.
        </p>
      </header>

      <div className="mb-5">
        <EnvoiQuestionnaire sessions={sessionsEnvoi} formateurs={formateurs.map((f) => ({ id: f.id, libelle: `${f.prenom} ${f.nom}` }))} dossiers={dossiers.map((d) => ({ id: d.id, libelle: d.reference ? `${d.financeurNom} — ${d.reference}` : d.financeurNom }))} />
      </div>

      <div className="mb-4 flex flex-wrap gap-1 rounded-lg border border-bordure bg-surface p-0.5 sm:inline-flex">
        <Link href="/questionnaires" className={`rounded-md px-3 py-1 text-[12.5px] font-semibold ${!filtre ? "bg-accent-pale text-accent-fort" : "text-texte-doux"}`}>
          Tous
        </Link>
        {TYPES.map((t) => (
          <Link key={t} href={`/questionnaires?type=${t}`} className={`rounded-md px-3 py-1 text-[12.5px] font-semibold ${filtre === t ? "bg-accent-pale text-accent-fort" : "text-texte-doux"}`}>
            {LIBELLE_TYPE_QUESTIONNAIRE[t]}
          </Link>
        ))}
      </div>

      <section className="flex flex-col gap-3">
        {envoyes.length === 0 ? (
          <p className="rounded-xl border border-bordure bg-surface px-4 py-8 text-center text-[13px] text-texte-doux shadow-sm">
            Aucun questionnaire envoyé dans cette catégorie.
          </p>
        ) : (
          envoyes.map((q) => {
            const destinataire = q.learner
              ? `${q.learner.prenom} ${q.learner.nom}`
              : q.trainer
                ? `${q.trainer.prenom} ${q.trainer.nom}`
                : (q.dossier?.financeurNom ?? "—");
            const reponses = (q.reponses ?? {}) as ReponsesQuestionnaire;
            const expire = !q.reponduAt && q.expireAt < new Date();

            return (
              <article key={q.id} className="rounded-xl border border-bordure bg-surface p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-[13.5px] font-bold">{destinataire}</p>
                    <p className="text-[12px] text-texte-tenu">
                      {LIBELLE_TYPE_QUESTIONNAIRE[q.type]}
                      {q.session && (
                        <>
                          {" · "}
                          <Link href={`/sessions/${q.session.id}`} className="hover:text-accent-fort">
                            {q.session.numero} — {q.session.formation.titre}
                          </Link>
                        </>
                      )}
                      {q.envoyeAt && ` · envoyé le ${jour.format(q.envoyeAt)}`}
                    </p>
                  </div>
                  <span
                    className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${
                      q.reponduAt ? "bg-succes/12 text-succes" : expire ? "bg-danger-pale text-danger" : "bg-surface-creuse text-texte-doux"
                    }`}
                  >
                    {q.reponduAt ? `Répondu le ${jour.format(q.reponduAt)}` : expire ? "Lien expiré" : "En attente"}
                  </span>
                </div>

                {q.reponduAt && (
                  <dl className="mt-3 flex flex-col gap-1.5 border-t border-bordure-douce pt-3">
                    {QUESTIONS_QUESTIONNAIRE[q.type].map((question) => {
                      const valeur = reponses[question.code];
                      return (
                        <div key={question.code} className="grid gap-0.5 sm:grid-cols-[1fr_auto] sm:gap-4">
                          {question.section && (
                            <p className="pt-1.5 text-[11px] font-bold uppercase tracking-wider text-texte-tenu sm:col-span-2">
                              {question.section}
                            </p>
                          )}
                          <dt className="text-[12.5px] text-texte-doux">{question.libelle}</dt>
                          <dd className="text-[12.5px] sm:text-right">
                            {question.type === "CASE" ? (
                              <span className={valeur ? "font-semibold text-succes" : "text-texte-tenu"}>{valeur ? "Oui" : "Non"}</span>
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
                )}
              </article>
            );
          })
        )}
      </section>
    </>
  );
}
