import { BandeauModeEnvoi } from "@/app/(app)/_composants/bandeau-envoi";
import { InterrupteurAutomatisation, LancementManuel } from "@/app/(app)/parametres/automatisations/controles";
import { modifierDelai } from "@/app/(app)/parametres/actions";
import {
  decrireAction,
  DECLENCHEURS_PLANIFIES,
  LIBELLE_DECLENCHEUR,
  LIBELLE_STATUT_EXECUTION,
  TON_STATUT_EXECUTION,
} from "@/lib/automatisations/libelles";
import { envoiReelActif } from "@/lib/emails/envoi";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";

export const dynamic = "force-dynamic";

const horodatage = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Paris",
});

export default async function PageAutomatisations() {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");
  const admin = utilisateur.role === "ADMIN";

  const automatisations = await prisma.automation.findMany({
    orderBy: { createdAt: "asc" },
    include: { executions: { orderBy: { createdAt: "desc" }, take: 5 } },
  });

  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight">Automatisations</h1>
          <p className="mt-1 max-w-2xl text-[12.8px] text-texte-doux">
            Chaque règle suit le principe « déclencheur → action ». Un même cas n&apos;est jamais traité
            deux fois : un apprenant ne reçoit pas deux fois le même email.
          </p>
        </div>
        {admin && <LancementManuel />}
      </header>

      <BandeauModeEnvoi reel={envoiReelActif()} />

      <div className="flex flex-col gap-4">
        {automatisations.map((a) => {
          const actions = Array.isArray(a.actions) ? a.actions : [];
          const jours = (a.parametres as { jours?: number })?.jours;
          return (
            <section key={a.id} className={`rounded-xl border bg-surface p-5 shadow-sm ${a.actif ? "border-accent" : "border-bordure"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-[15px] font-bold">{a.nom}</h2>
                  {a.description && <p className="mt-0.5 text-[12.5px] text-texte-doux">{a.description}</p>}
                </div>
                <InterrupteurAutomatisation id={a.id} actif={a.actif} modifiable={admin} />
              </div>

              <dl className="mt-4 grid gap-3 text-[12.8px] sm:grid-cols-[140px_1fr]">
                <dt className="font-semibold text-texte-tenu">Déclencheur</dt>
                <dd>
                  {LIBELLE_DECLENCHEUR[a.declencheur]}
                  {DECLENCHEURS_PLANIFIES.includes(a.declencheur) && (
                    <span className="ml-2 rounded-full bg-surface-creuse px-2 py-0.5 text-[11px] text-texte-tenu">vérifié chaque jour</span>
                  )}
                  {a.declencheur === "SESSION_AVANT_DEBUT" && (
                    <form action={modifierDelai} className="mt-2 flex items-center gap-2">
                      <input type="hidden" name="id" value={a.id} />
                      <input
                        type="number"
                        name="jours"
                        min={0}
                        max={60}
                        defaultValue={jours ?? 2}
                        disabled={!admin}
                        aria-label="Nombre de jours avant la session"
                        className="w-16 rounded-lg border border-bordure bg-surface px-2 py-1 text-[13px] disabled:bg-surface-creuse"
                      />
                      <span className="text-texte-doux">jours avant</span>
                      {admin && (
                        <button type="submit" className="rounded-lg border border-bordure px-2 py-1 text-[12px] font-semibold">
                          Enregistrer
                        </button>
                      )}
                    </form>
                  )}
                </dd>
                <dt className="font-semibold text-texte-tenu">Actions</dt>
                <dd>
                  <ol className="list-decimal pl-4">
                    {actions.map((action, i) => (
                      <li key={i}>{decrireAction(action)}</li>
                    ))}
                  </ol>
                </dd>
                <dt className="font-semibold text-texte-tenu">Dernières exécutions</dt>
                <dd>
                  {a.executions.length === 0 ? (
                    <span className="text-texte-tenu">Jamais exécutée.</span>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {a.executions.map((e) => (
                        <li key={e.id} className="text-[12px]">
                          <span className="font-mono tabular-nums text-texte-tenu">{horodatage.format(e.createdAt)}</span>{" "}
                          <span className={`font-semibold ${TON_STATUT_EXECUTION[e.statut]}`}>{LIBELLE_STATUT_EXECUTION[e.statut]}</span>
                          {e.detail ? <span className="text-texte-doux"> — {e.detail}</span> : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </dd>
              </dl>
            </section>
          );
        })}
      </div>
    </>
  );
}
