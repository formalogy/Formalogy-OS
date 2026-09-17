import type { StatutSession } from "@prisma/client";
import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";
import {
  ajouterJours,
  aujourdhuiUTC,
  BORDURE_STATUT_SESSION,
  jourDepuisSaisie,
  jourVersSaisie,
  LIBELLE_STATUT_SESSION,
  STATUTS_SESSION,
  TON_STATUT_SESSION,
} from "@/lib/sessions-libelles";

export const dynamic = "force-dynamic";

type Vue = "mois" | "semaine";

const NOMS_JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

const titreMois = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
const titreJour = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const jourMois = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });

/// Lundi de la semaine contenant la date (calendrier français).
function lundi(date: Date): Date {
  const decalage = (date.getUTCDay() + 6) % 7;
  return ajouterJours(date, -decalage);
}

function premierDuMois(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export default async function PagePlanning({
  searchParams,
}: {
  searchParams: Promise<{ vue?: string; date?: string; formation?: string; entreprise?: string; formateur?: string; statut?: string }>;
}) {
  await exigerRole("ADMIN", "GESTIONNAIRE");

  const params = await searchParams;
  const vue: Vue = params.vue === "semaine" ? "semaine" : "mois";
  const aujourdhui = aujourdhuiUTC();
  const reference = (params.date && jourDepuisSaisie(params.date)) || aujourdhui;
  const statut = STATUTS_SESSION.includes(params.statut as StatutSession)
    ? (params.statut as StatutSession)
    : undefined;

  // Période affichée : la grille du mois commence un lundi et couvre six
  // semaines, pour que chaque mois ait la même hauteur.
  const debut = vue === "mois" ? lundi(premierDuMois(reference)) : lundi(reference);
  const nombreJours = vue === "mois" ? 42 : 7;
  const fin = ajouterJours(debut, nombreJours - 1);

  const precedente =
    vue === "mois"
      ? new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() - 1, 1))
      : ajouterJours(reference, -7);
  const suivante =
    vue === "mois"
      ? new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() + 1, 1))
      : ajouterJours(reference, 7);

  const [sessions, formations, entreprises, formateurs] = await Promise.all([
    prisma.trainingSession.findMany({
      where: {
        deletedAt: null,
        // Une session apparaît si elle chevauche la période, même partiellement.
        dateDebut: { lte: fin },
        dateFin: { gte: debut },
        ...(statut ? { statut } : { statut: { not: "ANNULEE" } }),
        ...(params.formation ? { formationId: params.formation } : {}),
        ...(params.entreprise ? { companyId: params.entreprise } : {}),
        ...(params.formateur ? { trainerId: params.formateur } : {}),
      },
      orderBy: [{ dateDebut: "asc" }, { numero: "asc" }],
      include: {
        formation: { select: { titre: true } },
        company: { select: { raisonSociale: true } },
        trainer: { select: { prenom: true, nom: true } },
        _count: { select: { inscriptions: true } },
      },
    }),
    prisma.formation.findMany({ where: { deletedAt: null }, orderBy: { titre: "asc" }, select: { id: true, titre: true } }),
    prisma.company.findMany({ where: { deletedAt: null }, orderBy: { raisonSociale: "asc" }, select: { id: true, raisonSociale: true } }),
    prisma.trainer.findMany({ where: { deletedAt: null }, orderBy: [{ nom: "asc" }, { prenom: "asc" }], select: { id: true, prenom: true, nom: true } }),
  ]);

  const jours = Array.from({ length: nombreJours }, (_, i) => ajouterJours(debut, i));
  const sessionsDuJour = (jour: Date) =>
    sessions.filter((s) => s.dateDebut <= jour && s.dateFin >= jour);

  /// Lien vers le planning en conservant les filtres courants.
  const lien = (changements: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const fusion = { vue, date: jourVersSaisie(reference), formation: params.formation, entreprise: params.entreprise, formateur: params.formateur, statut, ...changements };
    for (const [cle, valeur] of Object.entries(fusion)) if (valeur) p.set(cle, valeur);
    return `/planning?${p.toString()}`;
  };

  const titre =
    vue === "mois"
      ? titreMois.format(reference)
      : `Semaine du ${jourMois.format(debut)} au ${jourMois.format(fin)}`;

  return (
    <>
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight">Planning</h1>
          <p className="mt-1 text-[12.8px] text-texte-doux">
            {sessions.length} session{sessions.length > 1 ? "s" : ""} sur la période
            {statut ? "" : " (hors sessions annulées)"}.
          </p>
        </div>
        <Link href="/sessions/nouvelle" className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white">
          Nouvelle session
        </Link>
      </header>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={lien({ date: jourVersSaisie(precedente) })} aria-label="Période précédente" className="rounded-lg border border-bordure bg-surface px-3 py-1.5 text-[13px] font-semibold">
            ←
          </Link>
          <Link href={lien({ date: jourVersSaisie(aujourdhui) })} className="rounded-lg border border-bordure bg-surface px-3 py-1.5 text-[13px] font-semibold">
            Aujourd&apos;hui
          </Link>
          <Link href={lien({ date: jourVersSaisie(suivante) })} aria-label="Période suivante" className="rounded-lg border border-bordure bg-surface px-3 py-1.5 text-[13px] font-semibold">
            →
          </Link>
          <h2 className="ml-2 text-[16px] font-bold first-letter:uppercase">{titre}</h2>
        </div>

        <div className="flex rounded-lg border border-bordure bg-surface p-0.5">
          {(["mois", "semaine"] as Vue[]).map((v) => (
            <Link
              key={v}
              href={lien({ vue: v })}
              aria-current={vue === v ? "page" : undefined}
              className={`rounded-md px-3 py-1 text-[12.5px] font-semibold capitalize ${vue === v ? "bg-accent-pale text-accent-fort" : "text-texte-doux"}`}
            >
              {v}
            </Link>
          ))}
        </div>
      </div>

      <form className="mb-4 flex flex-wrap items-center gap-2">
        <input type="hidden" name="vue" value={vue} />
        <input type="hidden" name="date" value={jourVersSaisie(reference)} />
        <select name="formation" defaultValue={params.formation ?? ""} className="rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent">
          <option value="">Toutes les formations</option>
          {formations.map((f) => (
            <option key={f.id} value={f.id}>{f.titre}</option>
          ))}
        </select>
        <select name="entreprise" defaultValue={params.entreprise ?? ""} className="rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent">
          <option value="">Toutes les entreprises</option>
          {entreprises.map((e) => (
            <option key={e.id} value={e.id}>{e.raisonSociale}</option>
          ))}
        </select>
        <select name="formateur" defaultValue={params.formateur ?? ""} className="rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent">
          <option value="">Tous les formateurs</option>
          {formateurs.map((f) => (
            <option key={f.id} value={f.id}>{f.prenom} {f.nom}</option>
          ))}
        </select>
        <select name="statut" defaultValue={statut ?? ""} className="rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent">
          <option value="">Tous les statuts</option>
          {STATUTS_SESSION.map((s) => (
            <option key={s} value={s}>{LIBELLE_STATUT_SESSION[s]}</option>
          ))}
        </select>
        <button type="submit" className="rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] font-semibold">
          Filtrer
        </button>
      </form>

      {vue === "mois" ? (
        <section className="overflow-x-auto rounded-xl border border-bordure bg-surface shadow-sm">
          <div className="grid min-w-[760px] grid-cols-7">
            {NOMS_JOURS.map((nom) => (
              <div key={nom} className="border-b border-bordure-douce bg-surface-creuse px-2 py-2 text-[10.8px] font-semibold uppercase tracking-wider text-texte-tenu">
                {nom}
              </div>
            ))}
            {jours.map((jour, i) => {
              const horsMois = jour.getUTCMonth() !== reference.getUTCMonth();
              const estAujourdhui = jour.getTime() === aujourdhui.getTime();
              const duJour = sessionsDuJour(jour);
              return (
                <div
                  key={jour.toISOString()}
                  className={`min-h-[104px] border-bordure-douce p-1.5 ${i % 7 !== 6 ? "border-r" : ""} ${i < 35 ? "border-b" : ""} ${horsMois ? "bg-surface-creuse/60" : ""}`}
                >
                  <div className={`mb-1 flex size-6 items-center justify-center rounded-full font-mono text-[11.5px] tabular-nums ${estAujourdhui ? "bg-accent font-semibold text-white" : horsMois ? "text-texte-tenu" : "text-texte-doux"}`}>
                    {jour.getUTCDate()}
                  </div>
                  <ul className="flex flex-col gap-1">
                    {duJour.slice(0, 3).map((s) => (
                      <li key={s.id}>
                        <Link
                          href={`/sessions/${s.id}`}
                          title={`${s.formation.titre} — ${s.company?.raisonSociale ?? "Inter-entreprises"} — ${LIBELLE_STATUT_SESSION[s.statut]}`}
                          className={`block truncate rounded border-l-[3px] bg-surface-creuse px-1.5 py-0.5 text-[11px] font-medium hover:bg-accent-pale ${BORDURE_STATUT_SESSION[s.statut]}`}
                        >
                          {s.formation.titre}
                        </Link>
                      </li>
                    ))}
                    {duJour.length > 3 && (
                      <li>
                        <Link href={lien({ vue: "semaine", date: jourVersSaisie(jour) })} className="px-1.5 text-[11px] font-semibold text-accent-fort hover:underline">
                          +{duJour.length - 3} autres
                        </Link>
                      </li>
                    )}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        <section className="flex flex-col gap-2">
          {jours.map((jour) => {
            const duJour = sessionsDuJour(jour);
            const estAujourdhui = jour.getTime() === aujourdhui.getTime();
            return (
              <div key={jour.toISOString()} className={`rounded-xl border bg-surface p-3 shadow-sm ${estAujourdhui ? "border-accent" : "border-bordure"}`}>
                <h3 className={`mb-2 text-[12.5px] font-bold first-letter:uppercase ${estAujourdhui ? "text-accent-fort" : ""}`}>
                  {titreJour.format(jour)}
                  {estAujourdhui && <span className="ml-2 text-[11px] font-semibold">· aujourd&apos;hui</span>}
                </h3>
                {duJour.length === 0 ? (
                  <p className="text-[12px] text-texte-tenu">Aucune session.</p>
                ) : (
                  <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {duJour.map((s) => (
                      <li key={s.id}>
                        <Link href={`/sessions/${s.id}`} className={`block rounded-lg border border-bordure-douce border-l-[3px] p-2.5 hover:bg-surface-creuse ${BORDURE_STATUT_SESSION[s.statut]}`}>
                          <div className="truncate text-[13px] font-semibold">{s.formation.titre}</div>
                          <div className="truncate text-[11.5px] text-texte-doux">
                            {s.company?.raisonSociale ?? "Inter-entreprises"}
                            {s.trainer ? ` · ${s.trainer.prenom} ${s.trainer.nom}` : ""}
                          </div>
                          <div className="mt-1.5 flex items-center justify-between gap-2">
                            <span className="truncate text-[11px] text-texte-tenu">
                              {s.horaires ?? "Horaires non précisés"} · {s._count.inscriptions} inscrit{s._count.inscriptions > 1 ? "s" : ""}
                            </span>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${TON_STATUT_SESSION[s.statut]}`}>
                              {LIBELLE_STATUT_SESSION[s.statut]}
                            </span>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </section>
      )}
    </>
  );
}
