import Link from "next/link";
import { notFound } from "next/navigation";

import { ListeDocuments, SELECTION_DOCUMENT_RESUME } from "@/app/(app)/_composants/liste-documents";
import { FormulaireInscription } from "@/app/(app)/sessions/[id]/formulaire-inscription";
import { SelecteurStatutSession } from "@/app/(app)/sessions/[id]/selecteur-statut";
import { desinscrireApprenant } from "@/app/(app)/sessions/actions";
import { LIBELLE_FINANCEMENT } from "@/lib/apprenants-libelles";
import { formaterEuros } from "@/lib/crm-libelles";
import { LIBELLE_MODALITE } from "@/lib/formations-libelles";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";
import { clePresence, joursDeSession, presencesCompletes } from "@/lib/emargement";
import {
  aujourdhuiUTC,
  formaterPeriode,
  listeDeControle,
  TON_STATUT_SESSION,
} from "@/lib/sessions-libelles";

export const dynamic = "force-dynamic";

function Ligne({ libelle, valeur }: { libelle: string; valeur?: React.ReactNode }) {
  return (
    <div className="flex gap-3 border-t border-bordure-douce py-2 first:border-t-0">
      <dt className="w-32 shrink-0 text-[12.5px] text-texte-tenu">{libelle}</dt>
      <dd className="text-[13px]">{valeur || "—"}</dd>
    </div>
  );
}

export default async function PageSession({ params }: { params: Promise<{ id: string }> }) {
  await exigerRole("ADMIN", "GESTIONNAIRE");
  const { id } = await params;

  const session = await prisma.trainingSession.findFirst({
    where: { id, deletedAt: null },
    include: {
      formation: { select: { id: true, titre: true, reference: true } },
      company: { select: { id: true, raisonSociale: true } },
      trainer: { select: { id: true, prenom: true, nom: true } },
      presences: { select: { learnerId: true, jour: true, creneau: true } },
      evaluations: { select: { learnerId: true } },
      inscriptions: {
        orderBy: { learner: { nom: "asc" } },
        include: {
          learner: {
            select: { id: true, prenom: true, nom: true, email: true, financement: true, company: { select: { raisonSociale: true } } },
          },
        },
      },
      documents: {
        ...SELECTION_DOCUMENT_RESUME,
        select: {
          ...SELECTION_DOCUMENT_RESUME.select,
          type: { select: { nom: true, code: true } },
          signatures: { where: { statut: "SIGNEE" }, select: { id: true } },
          learnerId: true,
        },
      },
    },
  });
  if (!session) notFound();

  // Un formateur ne peut pas animer deux sessions aux mêmes dates : on le
  // signale sans bloquer (demi-journées, visio courte…).
  const conflits = session.trainerId
    ? await prisma.trainingSession.findMany({
        where: {
          id: { not: session.id },
          trainerId: session.trainerId,
          deletedAt: null,
          statut: { not: "ANNULEE" },
          dateDebut: { lte: session.dateFin },
          dateFin: { gte: session.dateDebut },
        },
        orderBy: { dateDebut: "asc" },
        select: { id: true, numero: true, dateDebut: true, dateFin: true },
      })
    : [];

  const idsInscrits = session.inscriptions.map((i) => i.learner.id);
  // On propose en priorité les apprenants de l'entreprise cliente.
  const candidats = await prisma.learner.findMany({
    where: { deletedAt: null, id: { notIn: idsInscrits }, statut: { not: "ABANDONNE" } },
    orderBy: [{ nom: "asc" }, { prenom: "asc" }],
    select: { id: true, prenom: true, nom: true, companyId: true, company: { select: { raisonSociale: true } } },
  });
  const candidatsTries = [
    ...candidats.filter((c) => session.companyId && c.companyId === session.companyId),
    ...candidats.filter((c) => !session.companyId || c.companyId !== session.companyId),
  ];

  const controle = listeDeControle({
    nombreInscrits: session.inscriptions.length,
    conventionDeposee: session.documents.some((d) => d.type?.code === "CONVENTION"),
    conventionSignee: session.documents.some((d) => d.type?.code === "CONVENTION" && d.signatures.length > 0),
    presencesCompletes:
      session.dateFin <= aujourdhuiUTC() &&
      presencesCompletes({
        jours: joursDeSession(session.dateDebut, session.dateFin),
        aujourdhui: aujourdhuiUTC(),
        idsApprenants: session.inscriptions.map((i) => i.learner.id),
        saisies: new Set(session.presences.map((p) => clePresence(p.learnerId, p.jour, p.creneau))),
      }).complet,
    feuilleEmargementDeposee: session.documents.some((d) => d.type?.code === "EMARGEMENT"),
    evaluationsCompletes:
      session.inscriptions.length > 0 && session.inscriptions.every((i) => session.evaluations.some((e) => e.learnerId === i.learner.id)),
    attestationsCompletes:
      session.inscriptions.length > 0 &&
      session.inscriptions.every((i) => session.documents.some((d) => d.type?.code === "ATTESTATION" && d.learnerId === i.learner.id)),
  });
  const faits = controle.filter((c) => c.fait).length;
  const complete = session.placesMax !== null && session.inscriptions.length >= session.placesMax;

  return (
    <>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/sessions" className="text-[12.5px] font-semibold text-accent-fort hover:underline">
            ← Sessions
          </Link>
          <h1 className="mt-2 text-[22px] font-extrabold tracking-tight">{session.formation.titre}</h1>
          <p className="mt-1 text-[12.5px] text-texte-doux">
            <span className="font-mono text-texte-tenu">{session.numero}</span> ·{" "}
            {formaterPeriode(session.dateDebut, session.dateFin)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SelecteurStatutSession
            id={session.id}
            statut={session.statut}
            classeTon={TON_STATUT_SESSION[session.statut]}
          />
          <Link
            href={`/sessions/${session.id}/fin-de-formation`}
            className="rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] font-semibold"
          >
            Fin de formation
          </Link>
          <Link
            href={`/sessions/${session.id}/emargement`}
            className="rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] font-semibold"
          >
            Émargement
          </Link>
          <Link
            href={`/sessions/${session.id}/modifier`}
            className="rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] font-semibold"
          >
            Modifier
          </Link>
        </div>
      </header>

      {conflits.length > 0 && (
        <p role="alert" className="mb-4 rounded-lg bg-alerte/12 px-3 py-2 text-[12.5px] text-alerte">
          Attention : ce formateur est aussi affecté aux mêmes dates à{" "}
          {conflits.map((c, i) => (
            <span key={c.id}>
              {i > 0 && ", "}
              <Link href={`/sessions/${c.id}`} className="font-semibold underline">
                {c.numero}
              </Link>{" "}
              ({formaterPeriode(c.dateDebut, c.dateFin)})
            </span>
          ))}
          .
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-4">
          <section className="rounded-xl border border-bordure bg-surface p-5 shadow-sm">
            <h2 className="mb-3 text-[14.5px] font-bold">Informations</h2>
            <dl>
              <Ligne
                libelle="Formation"
                valeur={
                  <Link href={`/formations/${session.formation.id}`} className="hover:text-accent-fort">
                    {session.formation.titre} <span className="font-mono text-[11px] text-texte-tenu">{session.formation.reference}</span>
                  </Link>
                }
              />
              <Ligne
                libelle="Entreprise"
                valeur={
                  session.company ? (
                    <Link href={`/entreprises/${session.company.id}`} className="hover:text-accent-fort">
                      {session.company.raisonSociale}
                    </Link>
                  ) : (
                    "Inter-entreprises"
                  )
                }
              />
              <Ligne libelle="Horaires" valeur={session.horaires} />
              <Ligne libelle="Lieu" valeur={session.lieu} />
              <Ligne libelle="Modalité" valeur={LIBELLE_MODALITE[session.modalite]} />
              <Ligne
                libelle="Formateur"
                valeur={
                  session.trainer && (
                    <Link href={`/formateurs/${session.trainer.id}`} className="hover:text-accent-fort">
                      {session.trainer.prenom} {session.trainer.nom}
                    </Link>
                  )
                }
              />
              <Ligne libelle="Prix HT" valeur={formaterEuros(session.prixHT)} />
              <Ligne libelle="Notes" valeur={session.notes} />
            </dl>
          </section>

          <section className="rounded-xl border border-bordure bg-surface p-5 shadow-sm">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="text-[14.5px] font-bold">
                Apprenants inscrits{" "}
                <span className="font-normal text-texte-tenu">
                  ({session.inscriptions.length}
                  {session.placesMax ? ` / ${session.placesMax}` : ""})
                </span>
              </h2>
              {complete && (
                <span className="rounded-full bg-alerte/12 px-2 py-0.5 text-[11px] font-semibold text-alerte">
                  Complète
                </span>
              )}
            </div>

            {session.inscriptions.length === 0 ? (
              <p className="mb-4 text-[12.8px] text-texte-doux">Aucun apprenant inscrit pour le moment.</p>
            ) : (
              <ul className="mb-4">
                {session.inscriptions.map(({ learner }) => (
                  <li
                    key={learner.id}
                    className="flex items-center justify-between gap-3 border-t border-bordure-douce py-2 first:border-t-0"
                  >
                    <div className="min-w-0">
                      <Link href={`/apprenants/${learner.id}`} className="text-[13px] font-semibold hover:text-accent-fort">
                        {learner.prenom} {learner.nom}
                      </Link>
                      <div className="truncate text-[11.5px] text-texte-tenu">
                        {[learner.company?.raisonSociale, LIBELLE_FINANCEMENT[learner.financement], learner.email]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </div>
                    <form action={desinscrireApprenant}>
                      <input type="hidden" name="sessionId" value={session.id} />
                      <input type="hidden" name="learnerId" value={learner.id} />
                      <button
                        type="submit"
                        className="shrink-0 rounded-lg px-2 py-1 text-[12px] font-semibold text-texte-tenu hover:bg-danger-pale hover:text-danger"
                      >
                        Retirer
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}

            {!complete && session.statut !== "ANNULEE" && session.statut !== "CLOTUREE" && (
              <FormulaireInscription
                sessionId={session.id}
                candidats={candidatsTries.map((c) => ({
                  id: c.id,
                  libelle: `${c.nom} ${c.prenom}${c.company ? ` — ${c.company.raisonSociale}` : ""}`,
                }))}
              />
            )}
          </section>

          <ListeDocuments documents={session.documents} lienAjout={`session=${session.id}`} />
        </div>

        <section className="self-start rounded-xl border border-bordure bg-surface p-5 shadow-sm">
          <div className="mb-1 flex items-baseline justify-between">
            <h2 className="text-[14.5px] font-bold">Liste de contrôle</h2>
            <span className="font-mono text-[12px] tabular-nums text-texte-tenu">
              {faits} / {controle.length}
            </span>
          </div>
          <p className="mb-3 text-[12px] text-texte-tenu">
            Calculée à partir des données réelles de la session.
          </p>
          <ul>
            {controle.map((element) => (
              <li
                key={element.libelle}
                className="flex items-center gap-3 border-t border-bordure-douce py-2 first:border-t-0"
              >
                <span
                  aria-hidden="true"
                  className={`flex size-5 shrink-0 items-center justify-center rounded-md border text-[11px] font-bold ${
                    element.fait ? "border-succes bg-succes text-white" : "border-bordure bg-surface"
                  }`}
                >
                  {element.fait ? "✓" : ""}
                </span>
                <span className={`text-[13px] ${element.fait ? "font-semibold" : "text-texte-doux"}`}>
                  {element.libelle}
                </span>
                {element.phase && !element.fait && (
                  <span className="ml-auto rounded-full bg-bordure-douce px-1.5 py-px text-[10px] text-texte-tenu">
                    P{element.phase}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
