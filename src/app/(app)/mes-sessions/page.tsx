import Link from "next/link";

import { formateurDuCompte } from "@/lib/formateurs";
import { LIBELLE_MODALITE } from "@/lib/formations-libelles";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";
import { aujourdhuiUTC, formaterPeriode, LIBELLE_STATUT_SESSION, TON_STATUT_SESSION } from "@/lib/sessions-libelles";

export const dynamic = "force-dynamic";

/// Accueil des formateurs : uniquement les sessions qui leur sont affectées.
export default async function PageMesSessions({ searchParams }: { searchParams: Promise<{ passees?: string }> }) {
  const utilisateur = await exigerRole("FORMATEUR");
  const formateur = await formateurDuCompte(utilisateur.id);
  const { passees } = await searchParams;
  const voirPassees = passees === "1";
  const aujourdhui = aujourdhuiUTC();

  const sessions = formateur
    ? await prisma.trainingSession.findMany({
        where: {
          trainerId: formateur.id,
          deletedAt: null,
          // Un brouillon n'est pas encore confirmé au formateur.
          statut: { not: "BROUILLON" },
          dateFin: voirPassees ? { lt: aujourdhui } : { gte: aujourdhui },
        },
        orderBy: { dateDebut: voirPassees ? "desc" : "asc" },
        select: {
          id: true,
          numero: true,
          dateDebut: true,
          dateFin: true,
          horaires: true,
          lieu: true,
          modalite: true,
          statut: true,
          formation: { select: { titre: true } },
          _count: { select: { inscriptions: true } },
        },
      })
    : [];

  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight">Mes sessions</h1>
          <p className="mt-1 text-[12.8px] text-texte-doux">
            Bonjour {utilisateur.name.split(" ")[0]} — les sessions qui vous sont confiées.
          </p>
        </div>
        <div className="flex rounded-lg border border-bordure bg-surface p-0.5">
          <Link href="/mes-sessions" className={`rounded-md px-3 py-1 text-[12.5px] font-semibold ${!voirPassees ? "bg-accent-pale text-accent-fort" : "text-texte-doux"}`}>
            À venir
          </Link>
          <Link href="/mes-sessions?passees=1" className={`rounded-md px-3 py-1 text-[12.5px] font-semibold ${voirPassees ? "bg-accent-pale text-accent-fort" : "text-texte-doux"}`}>
            Passées
          </Link>
        </div>
      </header>

      {!formateur ? (
        <p className="rounded-xl border border-bordure bg-surface px-4 py-8 text-center text-[13px] text-texte-doux shadow-sm">
          Votre compte n&apos;est relié à aucune fiche formateur. Contactez l&apos;organisme.
        </p>
      ) : sessions.length === 0 ? (
        <p className="rounded-xl border border-bordure bg-surface px-4 py-8 text-center text-[13px] text-texte-doux shadow-sm">
          {voirPassees ? "Aucune session passée." : "Aucune session à venir pour le moment."}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {sessions.map((s) => (
            <li key={s.id}>
              <Link href={`/mes-sessions/${s.id}`} className="block rounded-xl border border-bordure bg-surface p-4 shadow-sm transition hover:border-accent">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[14px] font-bold">{s.formation.titre}</div>
                    <div className="mt-0.5 text-[12.5px] tabular-nums">{formaterPeriode(s.dateDebut, s.dateFin)}{s.horaires ? ` · ${s.horaires}` : ""}</div>
                    <div className="mt-0.5 text-[12px] text-texte-tenu">
                      {LIBELLE_MODALITE[s.modalite]}{s.lieu ? ` · ${s.lieu}` : ""} · {s._count.inscriptions} apprenant{s._count.inscriptions > 1 ? "s" : ""}
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${TON_STATUT_SESSION[s.statut]}`}>
                    {LIBELLE_STATUT_SESSION[s.statut]}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
