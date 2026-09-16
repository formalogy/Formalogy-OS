import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { exigerUtilisateur } from "@/lib/session";
import {
  ajouterJours,
  aujourdhuiUTC,
  formaterPeriode,
  LIBELLE_STATUT_SESSION,
  TON_STATUT_SESSION,
} from "@/lib/sessions-libelles";

export const dynamic = "force-dynamic";

const dateLongue = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Paris",
});

const heureCourte = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Paris",
});

/// Indicateur dont la source de données n'existe pas encore.
/// On affiche la structure cible sans jamais inventer de chiffre.
function IndicateurAVenir({ libelle, phase }: { libelle: string; phase: number }) {
  return (
    <div className="rounded-xl border border-dashed border-bordure bg-surface/50 p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-texte-tenu">{libelle}</div>
      <div className="mt-2 font-mono text-2xl text-texte-tenu">—</div>
      <div className="mt-2.5 border-t border-bordure-douce pt-2.5 text-[11.5px] text-texte-tenu">
        Disponible en Phase {phase}
      </div>
    </div>
  );
}

function Indicateur({
  libelle,
  valeur,
  precision,
  href,
}: {
  libelle: string;
  valeur: string | number;
  precision: string;
  href: string;
}) {
  return (
    <Link href={href} className="block rounded-xl border border-bordure bg-surface p-4 shadow-sm transition hover:border-accent">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-texte-tenu">{libelle}</div>
      <div className="mt-2 font-mono text-2xl font-semibold tabular-nums">{valeur}</div>
      <div className="mt-2.5 border-t border-bordure-douce pt-2.5 text-[11.5px] text-texte-doux">{precision}</div>
    </Link>
  );
}

export default async function PageTableauDeBord() {
  const utilisateur = await exigerUtilisateur();
  const aujourdhui = aujourdhuiUTC();

  const [nombreApprenants, nombreEntreprises, nombreFormations, sessionsEnCours, prochaines, activites] =
    await Promise.all([
      prisma.learner.count({
        where: { deletedAt: null, statut: { in: ["INSCRIT", "EN_FORMATION"] } },
      }),
      prisma.company.count({ where: { deletedAt: null } }),
      prisma.formation.count({ where: { deletedAt: null, statut: "ACTIVE" } }),
      // « En cours » selon le calendrier, quel que soit le statut saisi : une
      // session qui a démarré sans qu'on ait changé son statut compte quand même.
      prisma.trainingSession.count({
        where: {
          deletedAt: null,
          statut: { not: "ANNULEE" },
          dateDebut: { lte: aujourdhui },
          dateFin: { gte: aujourdhui },
        },
      }),
      prisma.trainingSession.findMany({
        where: {
          deletedAt: null,
          statut: { notIn: ["ANNULEE", "CLOTUREE"] },
          dateFin: { gte: aujourdhui },
          dateDebut: { lte: ajouterJours(aujourdhui, 60) },
        },
        orderBy: { dateDebut: "asc" },
        take: 6,
        include: {
          formation: { select: { titre: true } },
          company: { select: { raisonSociale: true } },
          _count: { select: { inscriptions: true } },
        },
      }),
      prisma.activity.findMany({
        orderBy: { createdAt: "desc" },
        take: 8,
        include: { user: { select: { name: true } } },
      }),
    ]);

  return (
    <>
      <header className="mb-6">
        <h1 className="text-[22px] font-extrabold tracking-tight">Tableau de bord</h1>
        <p className="mt-1 text-[12.8px] text-texte-doux">
          Bonjour {utilisateur.name.split(" ")[0]} — nous sommes le {dateLongue.format(new Date())}.
        </p>
      </header>

      <section aria-label="Indicateurs financiers" className="grid gap-3.5 sm:grid-cols-3">
        <IndicateurAVenir libelle="CA du mois" phase={13} />
        <IndicateurAVenir libelle="CA encaissé" phase={13} />
        <IndicateurAVenir libelle="Reste à encaisser" phase={13} />
      </section>

      <section aria-label="Indicateurs d'activité" className="mt-3.5 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <Indicateur libelle="Sessions en cours" valeur={sessionsEnCours} precision="aujourd'hui" href="/planning" />
        <Indicateur
          libelle="Apprenants actifs"
          valeur={nombreApprenants}
          precision="inscrits ou en formation"
          href="/apprenants"
        />
        <Indicateur
          libelle="Entreprises clientes"
          valeur={nombreEntreprises}
          precision={nombreEntreprises > 1 ? "fiches enregistrées" : "fiche enregistrée"}
          href="/entreprises"
        />
        <Indicateur
          libelle="Formations au catalogue"
          valeur={nombreFormations}
          precision={nombreFormations > 1 ? "formations actives" : "formation active"}
          href="/formations"
        />
      </section>

      <section className="mt-4 overflow-hidden rounded-xl border border-bordure bg-surface shadow-sm">
        <div className="flex items-center justify-between border-b border-bordure-douce px-4 py-3">
          <h2 className="text-[14.5px] font-bold">Prochaines sessions</h2>
          <Link href="/planning" className="text-[12px] font-semibold text-accent-fort hover:underline">
            Voir le planning
          </Link>
        </div>
        {prochaines.length === 0 ? (
          <p className="px-4 py-6 text-[13px] text-texte-doux">
            Aucune session dans les 60 prochains jours.{" "}
            <Link href="/sessions/nouvelle" className="font-semibold text-accent-fort hover:underline">
              Programmer une session
            </Link>
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12.8px]">
              <thead>
                <tr className="bg-surface-creuse text-left text-[10.8px] uppercase tracking-wider text-texte-tenu">
                  <th className="px-4 py-2 font-semibold">Formation</th>
                  <th className="whitespace-nowrap px-4 py-2 font-semibold">Entreprise</th>
                  <th className="whitespace-nowrap px-4 py-2 font-semibold">Intervenant</th>
                  <th className="whitespace-nowrap px-4 py-2 font-semibold">Dates</th>
                  <th className="whitespace-nowrap px-4 py-2 text-right font-semibold">Apprenants</th>
                  <th className="whitespace-nowrap px-4 py-2 font-semibold">Statut</th>
                </tr>
              </thead>
              <tbody>
                {prochaines.map((s) => (
                  <tr key={s.id} className="border-t border-bordure-douce hover:bg-surface-creuse">
                    <td className="px-4 py-2.5">
                      <Link href={`/sessions/${s.id}`} className="font-semibold hover:text-accent-fort">
                        {s.formation.titre}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-texte-doux">
                      {s.company?.raisonSociale ?? "Inter-entreprises"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-texte-doux">{s.intervenant ?? "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">{formaterPeriode(s.dateDebut, s.dateFin)}</td>
                    {/* Une session proche sans aucun inscrit est une anomalie à traiter. */}
                    <td className={`whitespace-nowrap px-4 py-2.5 text-right font-mono tabular-nums ${s._count.inscriptions === 0 ? "font-semibold text-danger" : ""}`}>
                      {s._count.inscriptions}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <span className={`inline-block rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${TON_STATUT_SESSION[s.statut]}`}>
                        {LIBELLE_STATUT_SESSION[s.statut]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <section className="overflow-hidden rounded-xl border border-bordure bg-surface shadow-sm">
          <div className="flex items-center justify-between border-b border-bordure-douce px-4 py-3">
            <h2 className="text-[14.5px] font-bold">Activité récente</h2>
            <Link href="/activite" className="text-[12px] font-semibold text-accent-fort hover:underline">
              Tout l&apos;historique
            </Link>
          </div>

          {activites.length === 0 ? (
            <p className="px-4 py-6 text-[13px] text-texte-doux">Aucune activité enregistrée pour le moment.</p>
          ) : (
            <ul>
              {activites.map((activite) => (
                <li key={activite.id} className="flex gap-3 border-t border-bordure-douce px-4 py-2.5 first:border-t-0">
                  <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-accent" />
                  <div className="min-w-0">
                    <p className="text-[13px]">{activite.summary}</p>
                    <p className="mt-0.5 text-[11.5px] text-texte-tenu">
                      {heureCourte.format(activite.createdAt)}
                      {activite.user ? ` · ${activite.user.name}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="flex flex-col gap-4">
          <section className="rounded-xl border border-bordure bg-surface p-4 shadow-sm">
            <h2 className="text-[14.5px] font-bold">Documents manquants</h2>
            <p className="mt-2 text-[12.5px] text-texte-doux">
              Conventions non signées, émargements absents, attestations à générer.
            </p>
            <p className="mt-3 border-t border-bordure-douce pt-3 text-[11.5px] text-texte-tenu">
              Alimenté à partir de la Phase 8.
            </p>
          </section>

          <section className="rounded-xl border border-bordure bg-surface p-4 shadow-sm">
            <h2 className="text-[14.5px] font-bold">Tâches</h2>
            <p className="mt-2 text-[12.5px] text-texte-doux">
              Relances commerciales, dossiers à compléter, factures impayées, actions Qualiopi.
            </p>
            <p className="mt-3 border-t border-bordure-douce pt-3 text-[11.5px] text-texte-tenu">
              Alimenté à partir de la Phase 9.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
