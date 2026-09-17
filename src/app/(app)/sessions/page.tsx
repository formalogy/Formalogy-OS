import type { StatutSession } from "@prisma/client";
import Link from "next/link";

import { nomFormateur } from "@/lib/formateurs";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";
import {
  aujourdhuiUTC,
  formaterPeriode,
  LIBELLE_STATUT_SESSION,
  STATUTS_SESSION,
  TON_STATUT_SESSION,
} from "@/lib/sessions-libelles";

export const dynamic = "force-dynamic";

const PERIODES = {
  a_venir: "À venir et en cours",
  passees: "Passées",
  toutes: "Toutes",
} as const;
type Periode = keyof typeof PERIODES;

export default async function PageSessions({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string; statut?: string; q?: string }>;
}) {
  await exigerRole("ADMIN", "GESTIONNAIRE");

  const params = await searchParams;
  const periode: Periode = params.periode && params.periode in PERIODES ? (params.periode as Periode) : "a_venir";
  const statut = STATUTS_SESSION.includes(params.statut as StatutSession)
    ? (params.statut as StatutSession)
    : undefined;
  const recherche = params.q?.trim() ?? "";
  const aujourdhui = aujourdhuiUTC();

  const sessions = await prisma.trainingSession.findMany({
    where: {
      deletedAt: null,
      ...(statut ? { statut } : {}),
      ...(periode === "a_venir" ? { dateFin: { gte: aujourdhui } } : {}),
      ...(periode === "passees" ? { dateFin: { lt: aujourdhui } } : {}),
      ...(recherche
        ? {
            OR: [
              { numero: { contains: recherche, mode: "insensitive" } },
              { formation: { titre: { contains: recherche, mode: "insensitive" } } },
              { company: { raisonSociale: { contains: recherche, mode: "insensitive" } } },
              { trainer: { OR: [{ nom: { contains: recherche, mode: "insensitive" } }, { prenom: { contains: recherche, mode: "insensitive" } }] } },
            ],
          }
        : {}),
    },
    orderBy: { dateDebut: periode === "passees" ? "desc" : "asc" },
    include: {
      formation: { select: { titre: true } },
      company: { select: { raisonSociale: true } },
      trainer: { select: { prenom: true, nom: true } },
      _count: { select: { inscriptions: true } },
    },
  });

  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight">Sessions</h1>
          <p className="mt-1 text-[12.8px] text-texte-doux">
            Les formations programmées : qui, quand, où, pour qui.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/planning"
            className="rounded-lg border border-bordure bg-surface px-4 py-2 text-[13px] font-semibold"
          >
            Planning
          </Link>
          <Link
            href="/sessions/nouvelle"
            className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white"
          >
            Nouvelle session
          </Link>
        </div>
      </header>

      <form className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="search"
          name="q"
          defaultValue={recherche}
          placeholder="Numéro, formation, entreprise, formateur…"
          className="w-full max-w-xs rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent-pale"
        />
        <select
          name="periode"
          defaultValue={periode}
          className="rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent"
        >
          {Object.entries(PERIODES).map(([valeur, libelle]) => (
            <option key={valeur} value={valeur}>
              {libelle}
            </option>
          ))}
        </select>
        <select
          name="statut"
          defaultValue={statut ?? ""}
          className="rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent"
        >
          <option value="">Tous les statuts</option>
          {STATUTS_SESSION.map((s) => (
            <option key={s} value={s}>
              {LIBELLE_STATUT_SESSION[s]}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] font-semibold"
        >
          Filtrer
        </button>
      </form>

      <section className="overflow-hidden rounded-xl border border-bordure bg-surface shadow-sm">
        {sessions.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-texte-doux">
            {periode === "a_venir" && !statut && !recherche
              ? "Aucune session à venir. Programmez-en une avec le bouton ci-dessus."
              : "Aucune session ne correspond à ces critères."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12.8px]">
              <thead>
                <tr className="bg-surface-creuse text-left text-[10.8px] uppercase tracking-wider text-texte-tenu">
                  <th className="px-4 py-2.5 font-semibold">Formation</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Dates</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Entreprise</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Formateur</th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-right font-semibold">Inscrits</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Statut</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id} className="border-t border-bordure-douce hover:bg-surface-creuse">
                    <td className="px-4 py-2.5">
                      <Link href={`/sessions/${s.id}`} className="font-semibold hover:text-accent-fort">
                        {s.formation.titre}
                      </Link>
                      <div className="font-mono text-[11px] text-texte-tenu">{s.numero}</div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">
                      {formaterPeriode(s.dateDebut, s.dateFin)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-texte-doux">
                      {s.company?.raisonSociale ?? "Inter-entreprises"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-texte-doux">{nomFormateur(s.trainer) ?? "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right font-mono tabular-nums">
                      {s._count.inscriptions}
                      {s.placesMax ? <span className="text-texte-tenu"> / {s.placesMax}</span> : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <span
                        className={`inline-block rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${TON_STATUT_SESSION[s.statut]}`}
                      >
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

      {sessions.length > 0 && (
        <p className="mt-3 text-[11.5px] text-texte-tenu">
          {sessions.length} session{sessions.length > 1 ? "s" : ""}.
        </p>
      )}
    </>
  );
}
