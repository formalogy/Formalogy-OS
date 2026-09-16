import Link from "next/link";

import { BandeauModeEnvoi } from "@/app/(app)/_composants/bandeau-envoi";
import { envoiReelActif } from "@/lib/emails/envoi";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function PageModelesEmails() {
  await exigerRole("ADMIN", "GESTIONNAIRE");

  const modeles = await prisma.emailTemplate.findMany({
    orderBy: { nom: "asc" },
    include: { _count: { select: { emails: true } } },
  });

  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight">Modèles d&apos;emails</h1>
          <p className="mt-1 text-[12.8px] text-texte-doux">
            Les textes utilisés par les automatisations et les envois depuis les fiches.
          </p>
        </div>
        <Link href="/emails" className="rounded-lg border border-bordure bg-surface px-4 py-2 text-[13px] font-semibold">
          Historique des envois
        </Link>
      </header>

      <BandeauModeEnvoi reel={envoiReelActif()} />

      <section className="overflow-hidden rounded-xl border border-bordure bg-surface shadow-sm">
        <ul>
          {modeles.map((m) => (
            <li key={m.id} className="border-t border-bordure-douce first:border-t-0">
              <Link href={`/parametres/modeles-emails/${m.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-creuse">
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold">
                    {m.nom} <span className="ml-1 font-mono text-[10.5px] font-normal text-texte-tenu">{m.code}</span>
                  </div>
                  <div className="truncate text-[12px] text-texte-doux">{m.sujet}</div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="font-mono text-[11px] tabular-nums text-texte-tenu">{m._count.emails} envoi{m._count.emails > 1 ? "s" : ""}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${m.actif ? "bg-succes/12 text-succes" : "bg-surface-creuse text-texte-tenu"}`}>
                    {m.actif ? "Actif" : "Désactivé"}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
