import Link from "next/link";

import { supprimerActionQualite } from "@/app/(app)/qualiopi/actions";
import { FormulaireAction } from "@/app/(app)/qualiopi/actions/formulaire";
import { SelecteurStatutAction } from "@/app/(app)/qualiopi/actions/selecteur-statut";
import { prisma } from "@/lib/prisma";
import { LIBELLE_ORIGINE_ACTION } from "@/lib/qualiopi";
import { exigerRole } from "@/lib/session";
import { aujourdhuiUTC } from "@/lib/sessions-libelles";

export const dynamic = "force-dynamic";

const jour = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });

/// Plan d'actions qualité : écarts d'audit, réclamations et améliorations,
/// suivis jusqu'à leur clôture (indicateur 32 du référentiel).
export default async function PageActionsQualite({ searchParams }: { searchParams: Promise<{ indicateur?: string; faites?: string }> }) {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");
  const params = await searchParams;
  const voirFaites = params.faites === "1";
  const aujourdhui = aujourdhuiUTC();

  const [actions, indicateurs] = await Promise.all([
    prisma.actionQualite.findMany({
      where: voirFaites ? { statut: "FAITE" } : { statut: { not: "FAITE" } },
      orderBy: voirFaites ? [{ faiteAt: "desc" }] : [{ echeance: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      take: 200,
      include: { indicateur: { select: { numero: true, critere: true } } },
    }),
    prisma.indicateurQualiopi.findMany({ orderBy: { numero: "asc" }, select: { numero: true, intitule: true } }),
  ]);

  return (
    <>
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/qualiopi" className="text-[12.5px] font-semibold text-accent-fort hover:underline">
            ← Qualiopi
          </Link>
          <h1 className="mt-2 text-[22px] font-extrabold tracking-tight">Plan d&apos;actions qualité</h1>
          <p className="mt-1 text-[12.8px] text-texte-doux">
            Écarts d&apos;audit, réclamations et améliorations : ce que vous montrerez comme démarche d&apos;amélioration continue.
          </p>
        </div>
        <div className="flex rounded-lg border border-bordure bg-surface p-0.5">
          <Link href="/qualiopi/actions" className={`rounded-md px-3 py-1 text-[12.5px] font-semibold ${!voirFaites ? "bg-accent-pale text-accent-fort" : "text-texte-doux"}`}>
            En cours
          </Link>
          <Link href="/qualiopi/actions?faites=1" className={`rounded-md px-3 py-1 text-[12.5px] font-semibold ${voirFaites ? "bg-accent-pale text-accent-fort" : "text-texte-doux"}`}>
            Terminées
          </Link>
        </div>
      </header>

      {!voirFaites && <FormulaireAction indicateurs={indicateurs} indicateurParDefaut={params.indicateur} />}

      <section className="mt-4 overflow-hidden rounded-xl border border-bordure bg-surface shadow-sm">
        {actions.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-texte-doux">
            {voirFaites ? "Aucune action terminée." : "Aucune action en cours."}
          </p>
        ) : (
          <ul>
            {actions.map((a) => {
              const enRetard = !voirFaites && a.echeance && a.echeance < aujourdhui;
              return (
                <li key={a.id} className="border-t border-bordure-douce px-4 py-3 first:border-t-0">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[13.5px] font-semibold">{a.titre}</div>
                      <div className="mt-0.5 text-[11.5px] text-texte-tenu">
                        {LIBELLE_ORIGINE_ACTION[a.origine]}
                        {a.indicateur && ` · indicateur ${a.indicateur.numero} (critère ${a.indicateur.critere})`}
                        {a.responsable && ` · ${a.responsable}`}
                        {a.echeance && (
                          <span className={enRetard ? " font-semibold text-danger" : ""}> · échéance {jour.format(a.echeance)}{enRetard ? " (dépassée)" : ""}</span>
                        )}
                        {a.faiteAt && ` · terminée le ${jour.format(a.faiteAt)}`}
                      </div>
                      {a.description && <p className="mt-1 whitespace-pre-line text-[12.5px] text-texte-doux">{a.description}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <SelecteurStatutAction id={a.id} statut={a.statut} titre={a.titre} />
                      {utilisateur.role === "ADMIN" && (
                        <form action={supprimerActionQualite}>
                          <input type="hidden" name="id" value={a.id} />
                          <button type="submit" className="rounded-lg px-2 py-1 text-[12px] font-semibold text-texte-tenu hover:bg-danger-pale hover:text-danger">
                            Supprimer
                          </button>
                        </form>
                      )}
                    </div>
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
