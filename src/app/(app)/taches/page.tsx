import Link from "next/link";

import { FormulaireTache } from "@/app/(app)/taches/formulaire";
import { basculerTache } from "@/app/(app)/taches/actions";
import { LIBELLE_PRIORITE, TON_PRIORITE } from "@/lib/automatisations/libelles";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";
import { aujourdhuiUTC } from "@/lib/sessions-libelles";

export const dynamic = "force-dynamic";

const jour = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export default async function PageTaches({ searchParams }: { searchParams: Promise<{ faites?: string }> }) {
  await exigerRole("ADMIN", "GESTIONNAIRE");
  const { faites } = await searchParams;
  const voirFaites = faites === "1";
  const aujourdhui = aujourdhuiUTC();

  const taches = await prisma.task.findMany({
    where: { statut: voirFaites ? "FAITE" : "A_FAIRE" },
    orderBy: voirFaites ? [{ faiteAt: "desc" }] : [{ echeance: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    take: 200,
    include: {
      learner: { select: { id: true, prenom: true, nom: true } },
      session: { select: { id: true, numero: true } },
      prospect: { select: { prenom: true, nom: true } },
      automationRun: { select: { automation: { select: { nom: true } } } },
    },
  });

  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight">Tâches</h1>
          <p className="mt-1 text-[12.8px] text-texte-doux">
            Ce qu&apos;il reste à faire : créé à la main ou par les automatisations.
          </p>
        </div>
        <div className="flex rounded-lg border border-bordure bg-surface p-0.5">
          <Link href="/taches" className={`rounded-md px-3 py-1 text-[12.5px] font-semibold ${!voirFaites ? "bg-accent-pale text-accent-fort" : "text-texte-doux"}`}>
            À faire
          </Link>
          <Link href="/taches?faites=1" className={`rounded-md px-3 py-1 text-[12.5px] font-semibold ${voirFaites ? "bg-accent-pale text-accent-fort" : "text-texte-doux"}`}>
            Terminées
          </Link>
        </div>
      </header>

      {!voirFaites && <FormulaireTache />}

      <section className="mt-4 overflow-hidden rounded-xl border border-bordure bg-surface shadow-sm">
        {taches.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-texte-doux">
            {voirFaites ? "Aucune tâche terminée." : "Rien à faire pour le moment."}
          </p>
        ) : (
          <ul>
            {taches.map((t) => {
              const enRetard = !voirFaites && t.echeance && t.echeance < aujourdhui;
              const lien = t.learner
                ? { href: `/apprenants/${t.learner.id}`, libelle: `${t.learner.prenom} ${t.learner.nom}` }
                : t.session
                  ? { href: `/sessions/${t.session.id}`, libelle: t.session.numero }
                  : t.prospect
                    ? { href: "/crm", libelle: `${t.prospect.prenom} ${t.prospect.nom}` }
                    : null;
              return (
                <li key={t.id} className="flex items-start gap-3 border-t border-bordure-douce px-4 py-3 first:border-t-0">
                  <form action={basculerTache} className="pt-0.5">
                    <input type="hidden" name="id" value={t.id} />
                    <button
                      type="submit"
                      aria-label={voirFaites ? `Rouvrir « ${t.titre} »` : `Marquer « ${t.titre} » comme faite`}
                      className={`flex size-5 items-center justify-center rounded-md border text-[11px] font-bold ${voirFaites ? "border-succes bg-succes text-white" : "border-bordure bg-surface hover:border-accent"}`}
                    >
                      {voirFaites ? "✓" : ""}
                    </button>
                  </form>
                  <div className="min-w-0 flex-1">
                    <div className={`text-[13px] font-semibold ${voirFaites ? "text-texte-tenu line-through" : ""}`}>{t.titre}</div>
                    <div className="text-[11.5px] text-texte-tenu">
                      {lien && (
                        <Link href={lien.href} className="text-accent-fort hover:underline">{lien.libelle}</Link>
                      )}
                      {lien && t.automationRun && " · "}
                      {t.automationRun && `automatisation « ${t.automationRun.automation.nom} »`}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${TON_PRIORITE[t.priorite]}`}>{LIBELLE_PRIORITE[t.priorite]}</span>
                    {t.echeance && (
                      <span className={`font-mono text-[11px] tabular-nums ${enRetard ? "font-semibold text-danger" : "text-texte-tenu"}`}>
                        {enRetard ? "En retard · " : ""}{jour.format(t.echeance)}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
