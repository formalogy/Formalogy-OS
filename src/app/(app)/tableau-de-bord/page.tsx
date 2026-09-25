import Link from "next/link";
import { redirect } from "next/navigation";

import { alertesDeroulement } from "@/lib/deroulement-alertes";
import { enCentimes, formaterMontant, situationFacture } from "@/lib/factures";
import { nomFormateur } from "@/lib/formateurs";
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
  // Les formateurs ont leur propre accueil, limité à leurs sessions.
  if (utilisateur.role === "FORMATEUR") redirect("/mes-sessions");
  const aujourdhui = aujourdhuiUTC();
  const debutMois = new Date(Date.UTC(aujourdhui.getUTCFullYear(), aujourdhui.getUTCMonth(), 1));
  const debutAnnee = new Date(Date.UTC(aujourdhui.getUTCFullYear(), 0, 1));

  const [
    nombreApprenants,
    nombreEntreprises,
    nombreFormations,
    sessionsEnCours,
    prochaines,
    activites,
    sansConvention,
    inscriptionsTerminees,
    taches,
    nombreTaches,
    facturesMois,
    paiementsMois,
    facturesOuvertes,
    facturesAnnee,
    entrantsAujourdhui,
    sortantsAujourdhui,
    alertes,
  ] = await Promise.all([
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
          trainer: { select: { prenom: true, nom: true } },
          _count: { select: { inscriptions: true } },
        },
      }),
      prisma.activity.findMany({
        orderBy: { createdAt: "desc" },
        take: 8,
        include: { user: { select: { name: true } } },
      }),
      // Sessions en cours ou démarrant sous 30 jours sans convention déposée.
      prisma.trainingSession.findMany({
        where: {
          deletedAt: null,
          statut: { notIn: ["ANNULEE", "CLOTUREE"] },
          dateFin: { gte: aujourdhui },
          dateDebut: { lte: ajouterJours(aujourdhui, 30) },
          documents: { none: { deletedAt: null, type: { code: "CONVENTION" } } },
        },
        orderBy: { dateDebut: "asc" },
        take: 10,
        select: { id: true, numero: true, dateDebut: true, formation: { select: { titre: true } } },
      }),
      // Apprenants de sessions achevées depuis moins de 90 jours : on cherche
      // ceux qui n'ont pas d'attestation déposée pour cette session.
      prisma.sessionLearner.findMany({
        where: {
          session: {
            deletedAt: null,
            statut: { not: "ANNULEE" },
            dateFin: { lt: aujourdhui, gte: ajouterJours(aujourdhui, -90) },
          },
          learner: { deletedAt: null },
        },
        take: 300,
        select: {
          session: { select: { id: true, numero: true } },
          learner: {
            select: {
              id: true,
              prenom: true,
              nom: true,
              documents: {
                where: { deletedAt: null, type: { code: "ATTESTATION" } },
                select: { sessionId: true },
              },
            },
          },
        },
      }),
      prisma.task.findMany({
        where: { statut: "A_FAIRE" },
        orderBy: [{ echeance: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
        take: 6,
      }),
      prisma.task.count({ where: { statut: "A_FAIRE" } }),
      prisma.facture.findMany({
        where: { statut: { in: ["EMISE", "PAYEE"] }, dateEmission: { gte: debutMois } },
        select: { montantHT: true },
      }),
      prisma.paiement.findMany({ where: { date: { gte: debutMois } }, select: { montant: true } }),
      prisma.facture.findMany({
        where: { statut: "EMISE" },
        select: { statut: true, montantTTC: true, dateEcheance: true, paiements: { select: { montant: true } } },
      }),
      prisma.facture.findMany({
        where: { statut: { in: ["EMISE", "PAYEE"] }, dateEmission: { gte: debutAnnee } },
        select: { montantHT: true },
      }),
      // Apprenants dont une session démarre aujourd'hui.
      prisma.sessionLearner.findMany({
        where: {
          session: { deletedAt: null, statut: { not: "ANNULEE" }, dateDebut: aujourdhui },
          learner: { deletedAt: null },
        },
        select: {
          learner: { select: { id: true, prenom: true, nom: true } },
          session: { select: { id: true, numero: true, formation: { select: { titre: true } } } },
        },
      }),
      // Apprenants dont une session se termine aujourd'hui.
      prisma.sessionLearner.findMany({
        where: {
          session: { deletedAt: null, statut: { not: "ANNULEE" }, dateFin: aujourdhui },
          learner: { deletedAt: null },
        },
        select: {
          learner: { select: { id: true, prenom: true, nom: true } },
          session: { select: { id: true, numero: true, formation: { select: { titre: true } } } },
        },
      }),
      // Ce qui bloque le déroulement automatique : le seul endroit où
      // intervenir quand tout ne se passe pas bien.
      alertesDeroulement(),
    ]);

  const caAnnee = facturesAnnee.reduce((t, f) => t + enCentimes(f.montantHT), 0);
  const caMois = facturesMois.reduce((t, f) => t + enCentimes(f.montantHT), 0);
  const encaisseMois = paiementsMois.reduce((t, p) => t + enCentimes(p.montant), 0);
  const situations = facturesOuvertes.map((f) => situationFacture(f, f.paiements, aujourdhui));
  const resteAEncaisser = situations.reduce((t, x) => t + x.resteCentimes, 0);
  const facturesEnRetard = situations.filter((x) => x.enRetard).length;

  const sansAttestation = inscriptionsTerminees.filter(
    (i) => !i.learner.documents.some((d) => d.sessionId === i.session.id),
  );
  const nombreManquants = sansConvention.length + sansAttestation.length;

  return (
    <>
      <header className="mb-6">
        <h1 className="text-[22px] font-extrabold tracking-tight">Tableau de bord</h1>
        <p className="mt-1 text-[12.8px] text-texte-doux">
          Bonjour {utilisateur.name.split(" ")[0]} — nous sommes le {dateLongue.format(new Date())}.
        </p>
      </header>

      <section aria-label="Indicateurs financiers" className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <Indicateur libelle="Facturé ce mois" valeur={formaterMontant(caMois / 100)} precision="hors taxes, factures émises" href="/factures?filtre=toutes" />
        <Indicateur libelle="Encaissé ce mois" valeur={formaterMontant(encaisseMois / 100)} precision="paiements reçus" href="/paiements" />
        <Indicateur
          libelle="CA annuel"
          valeur={formaterMontant(caAnnee / 100)}
          precision={`hors taxes, depuis le 1ᵉʳ janvier ${aujourdhui.getUTCFullYear()}`}
          href="/factures?filtre=toutes"
        />
        <Indicateur
          libelle="Reste à encaisser"
          valeur={formaterMontant(resteAEncaisser / 100)}
          precision={facturesEnRetard > 0 ? `dont ${facturesEnRetard} facture(s) en retard` : "factures émises non soldées"}
          href={facturesEnRetard > 0 ? "/factures?filtre=retard" : "/factures"}
        />
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

      <section
        className={`mt-4 overflow-hidden rounded-xl border bg-surface shadow-sm ${alertes.length > 0 ? "border-alerte/60" : "border-bordure"}`}
      >
        <div className="flex items-center justify-between border-b border-bordure-douce px-4 py-3">
          <h2 className="text-[14.5px] font-bold">À surveiller — déroulement automatique</h2>
          <span
            className={`rounded-full px-2 py-0.5 font-mono text-[11px] ${alertes.length > 0 ? "bg-danger-pale text-danger" : "bg-surface-creuse text-texte-tenu"}`}
          >
            {alertes.length}
          </span>
        </div>
        {alertes.length === 0 ? (
          <p className="px-4 py-4 text-[12.8px] text-texte-doux">Rien à signaler : les sessions lancées se déroulent seules.</p>
        ) : (
          <ul className="max-h-80 overflow-y-auto">
            {alertes.map((a, i) => (
              <li key={i} className="border-t border-bordure-douce first:border-t-0">
                <Link href={a.lien} className="flex items-start gap-2.5 px-4 py-2.5 text-[12.8px] hover:bg-surface-creuse">
                  <span
                    className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${a.niveau === "bloquant" ? "bg-danger-pale text-danger" : "bg-alerte/12 text-alerte"}`}
                  >
                    {a.niveau === "bloquant" ? "À régler" : "En attente"}
                  </span>
                  <span>{a.texte}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-4 flex flex-col gap-4">
        <section className="overflow-hidden rounded-xl border border-bordure bg-surface shadow-sm">
          <div className="border-b border-bordure-douce px-4 py-3">
            <h2 className="text-[14.5px] font-bold">Entrées en formation aujourd&apos;hui</h2>
          </div>
          {entrantsAujourdhui.length === 0 ? (
            <p className="px-4 py-4 text-[12.8px] text-texte-doux">Aucune entrée en formation aujourd&apos;hui.</p>
          ) : (
            <ul>
              {entrantsAujourdhui.map((i) => (
                <li key={`${i.session.id}-${i.learner.id}`} className="border-t border-bordure-douce first:border-t-0">
                  <Link href={`/apprenants/${i.learner.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-surface-creuse">
                    <span className="min-w-0 truncate text-[12.8px] font-semibold">{i.learner.prenom} {i.learner.nom}</span>
                    <span className="shrink-0 truncate text-[11.5px] text-texte-tenu">{i.session.formation.titre} · {i.session.numero}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="overflow-hidden rounded-xl border border-bordure bg-surface shadow-sm">
          <div className="border-b border-bordure-douce px-4 py-3">
            <h2 className="text-[14.5px] font-bold">Sorties de formation aujourd&apos;hui</h2>
          </div>
          {sortantsAujourdhui.length === 0 ? (
            <p className="px-4 py-4 text-[12.8px] text-texte-doux">Aucune sortie de formation aujourd&apos;hui.</p>
          ) : (
            <ul>
              {sortantsAujourdhui.map((i) => (
                <li key={`${i.session.id}-${i.learner.id}`} className="border-t border-bordure-douce first:border-t-0">
                  <Link href={`/apprenants/${i.learner.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-surface-creuse">
                    <span className="min-w-0 truncate text-[12.8px] font-semibold">{i.learner.prenom} {i.learner.nom}</span>
                    <span className="shrink-0 truncate text-[11.5px] text-texte-tenu">{i.session.formation.titre} · {i.session.numero}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

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
                  <th className="whitespace-nowrap px-4 py-2 font-semibold">Formateur</th>
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
                    <td className="whitespace-nowrap px-4 py-2.5 text-texte-doux">{nomFormateur(s.trainer) ?? "—"}</td>
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
          <section className="overflow-hidden rounded-xl border border-bordure bg-surface shadow-sm">
            <div className="flex items-center justify-between border-b border-bordure-douce px-4 py-3">
              <h2 className="text-[14.5px] font-bold">Documents manquants</h2>
              <span className={`rounded-full px-2 py-0.5 font-mono text-[11px] ${nombreManquants > 0 ? "bg-danger-pale text-danger" : "bg-surface-creuse text-texte-tenu"}`}>
                {nombreManquants}
              </span>
            </div>
            {nombreManquants === 0 ? (
              <p className="px-4 py-4 text-[12.8px] text-texte-doux">
                Aucune convention ni attestation manquante.
              </p>
            ) : (
              <ul className="max-h-72 overflow-y-auto">
                {sansConvention.map((s) => (
                  <li key={`c-${s.id}`} className="border-t border-bordure-douce first:border-t-0">
                    <Link href={`/documents/nouveau?session=${s.id}&type=CONVENTION`} className="flex gap-2.5 px-4 py-2.5 hover:bg-surface-creuse">
                      <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-danger" />
                      <span className="min-w-0">
                        <span className="block text-[12.8px] font-semibold">Convention absente</span>
                        <span className="block truncate text-[11.5px] text-texte-tenu">{s.formation.titre} · {s.numero}</span>
                      </span>
                    </Link>
                  </li>
                ))}
                {sansAttestation.map((i) => (
                  <li key={`a-${i.session.id}-${i.learner.id}`} className="border-t border-bordure-douce first:border-t-0">
                    <Link href={`/sessions/${i.session.id}/fin-de-formation`} className="flex gap-2.5 px-4 py-2.5 hover:bg-surface-creuse">
                      <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-alerte" />
                      <span className="min-w-0">
                        <span className="block text-[12.8px] font-semibold">Attestation absente</span>
                        <span className="block truncate text-[11.5px] text-texte-tenu">{i.learner.prenom} {i.learner.nom} · {i.session.numero}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <p className="border-t border-bordure-douce px-4 py-2.5 text-[11px] text-texte-tenu">
              Conventions des sessions à moins de 30 jours ; attestations des 90 derniers jours.
            </p>
          </section>

          <section className="overflow-hidden rounded-xl border border-bordure bg-surface shadow-sm">
            <div className="flex items-center justify-between border-b border-bordure-douce px-4 py-3">
              <h2 className="text-[14.5px] font-bold">Tâches</h2>
              <Link href="/taches" className="text-[12px] font-semibold text-accent-fort hover:underline">
                Toutes ({nombreTaches})
              </Link>
            </div>
            {taches.length === 0 ? (
              <p className="px-4 py-4 text-[12.8px] text-texte-doux">Rien à faire pour le moment.</p>
            ) : (
              <ul>
                {taches.map((t) => {
                  const enRetard = t.echeance !== null && t.echeance < aujourdhui;
                  return (
                    <li key={t.id} className="border-t border-bordure-douce first:border-t-0">
                      <Link href="/taches" className="flex items-start justify-between gap-3 px-4 py-2.5 hover:bg-surface-creuse">
                        <span className="min-w-0 text-[12.8px] font-semibold">{t.titre}</span>
                        {t.echeance && (
                          <span className={`shrink-0 font-mono text-[11px] tabular-nums ${enRetard ? "font-semibold text-danger" : "text-texte-tenu"}`}>
                            {formaterPeriode(t.echeance, t.echeance)}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
