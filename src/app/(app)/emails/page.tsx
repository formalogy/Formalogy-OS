import type { StatutEmail } from "@prisma/client";
import Link from "next/link";

import { BandeauModeEnvoi } from "@/app/(app)/_composants/bandeau-envoi";
import { LIBELLE_STATUT_EMAIL, TON_STATUT_EMAIL } from "@/lib/automatisations/libelles";
import { envoiReelActif } from "@/lib/emails/envoi";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";

export const dynamic = "force-dynamic";

const STATUTS: StatutEmail[] = ["SIMULE", "ENVOYE", "OUVERT", "ECHEC"];

const horodatage = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Paris",
});

export default async function PageEmails({ searchParams }: { searchParams: Promise<{ statut?: string; q?: string }> }) {
  await exigerRole("ADMIN", "GESTIONNAIRE");
  const params = await searchParams;
  const statut = STATUTS.includes(params.statut as StatutEmail) ? (params.statut as StatutEmail) : undefined;
  const recherche = params.q?.trim() ?? "";

  const emails = await prisma.email.findMany({
    where: {
      ...(statut ? { statut } : {}),
      ...(recherche
        ? { OR: [{ destinataire: { contains: recherche, mode: "insensitive" } }, { sujet: { contains: recherche, mode: "insensitive" } }] }
        : {}),
    },
    orderBy: { envoyeAt: "desc" },
    take: 200,
    include: {
      learner: { select: { id: true, prenom: true, nom: true } },
      automationRun: { select: { automation: { select: { nom: true } } } },
      createdBy: { select: { name: true } },
    },
  });

  return (
    <>
      <header className="mb-6">
        <Link href="/parametres/modeles-emails" className="text-[12.5px] font-semibold text-accent-fort hover:underline">
          ← Modèles d&apos;emails
        </Link>
        <h1 className="mt-2 text-[22px] font-extrabold tracking-tight">Historique des emails</h1>
      </header>

      <BandeauModeEnvoi reel={envoiReelActif()} />

      <form className="mb-4 flex flex-wrap items-center gap-2">
        <input type="search" name="q" defaultValue={recherche} placeholder="Destinataire ou sujet…" className="w-full max-w-xs rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent-pale" />
        <select name="statut" defaultValue={statut ?? ""} className="rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent">
          <option value="">Tous les statuts</option>
          {STATUTS.map((s) => (
            <option key={s} value={s}>{LIBELLE_STATUT_EMAIL[s]}</option>
          ))}
        </select>
        <button type="submit" className="rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] font-semibold">Filtrer</button>
      </form>

      <section className="overflow-hidden rounded-xl border border-bordure bg-surface shadow-sm">
        {emails.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-texte-doux">Aucun email pour le moment.</p>
        ) : (
          <ul>
            {emails.map((e) => (
              <li key={e.id} className="border-t border-bordure-douce first:border-t-0">
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 hover:bg-surface-creuse">
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-semibold">{e.sujet}</div>
                      <div className="truncate text-[11.5px] text-texte-tenu">
                        {horodatage.format(e.envoyeAt)} · à {e.destinataire}
                        {e.automationRun ? ` · automatisation « ${e.automationRun.automation.nom} »` : e.createdBy ? ` · par ${e.createdBy.name}` : ""}
                      </div>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${TON_STATUT_EMAIL[e.statut]}`}>
                      {LIBELLE_STATUT_EMAIL[e.statut]}
                    </span>
                  </summary>
                  <div className="border-t border-bordure-douce bg-surface-creuse/50 px-4 py-3">
                    {e.erreur && <p className="mb-2 text-[12.5px] font-semibold text-danger">{e.erreur}</p>}
                    {e.learner && (
                      <p className="mb-2 text-[12px]">
                        Apprenant : <Link href={`/apprenants/${e.learner.id}`} className="font-semibold text-accent-fort hover:underline">{e.learner.prenom} {e.learner.nom}</Link>
                      </p>
                    )}
                    <p className="whitespace-pre-line text-[12.8px] leading-relaxed">{e.corps}</p>
                    {(e.delivreAt || e.ouvertAt) && (
                      <p className="mt-2 text-[11.5px] text-texte-tenu">
                        {e.delivreAt && `Délivré le ${horodatage.format(e.delivreAt)}`}
                        {e.delivreAt && e.ouvertAt && " · "}
                        {e.ouvertAt && `Ouvert le ${horodatage.format(e.ouvertAt)}`}
                      </p>
                    )}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
