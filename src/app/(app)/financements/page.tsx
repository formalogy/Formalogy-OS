import Link from "next/link";

import { enCentimes, formaterMontant } from "@/lib/factures";
import { LIBELLE_FINANCEUR } from "@/lib/financements";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";

export const dynamic = "force-dynamic";

const jour = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });

export default async function PageFinancements() {
  await exigerRole("ADMIN", "GESTIONNAIRE");

  const dossiers = await prisma.dossierFinancement.findMany({
    orderBy: { createdAt: "desc" },
    take: 300,
    include: {
      session: { select: { id: true, numero: true, formation: { select: { titre: true } } } },
      company: { select: { raisonSociale: true } },
      learner: { select: { prenom: true, nom: true } },
    },
  });

  const total = dossiers.reduce((t, d) => t + enCentimes(d.montant ?? 0), 0);

  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight">Prises en charge</h1>
          <p className="mt-1 text-[12.8px] text-texte-doux">
            Dossiers OPCO, France Travail et CPF : financeur, montant, rattachement.
          </p>
        </div>
        <Link href="/financements/nouveau" className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white">
          Nouveau dossier
        </Link>
      </header>

      {total > 0 && (
        <p className="mb-4 text-[12.5px]">
          Total financé : <strong className="font-mono">{formaterMontant(total / 100)}</strong>
        </p>
      )}

      <section className="overflow-hidden rounded-xl border border-bordure bg-surface shadow-sm">
        {dossiers.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-texte-doux">
            Aucun dossier enregistré. Créez-en un depuis une session ou avec le bouton ci-dessus.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12.8px]">
              <thead>
                <tr className="bg-surface-creuse text-left text-[10.8px] uppercase tracking-wider text-texte-tenu">
                  <th className="px-4 py-2.5 font-semibold">Financeur</th>
                  <th className="px-4 py-2.5 font-semibold">Rattachement</th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-right font-semibold">Montant</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Enregistré le</th>
                </tr>
              </thead>
              <tbody>
                {dossiers.map((d) => (
                  <tr key={d.id} className="border-t border-bordure-douce hover:bg-surface-creuse">
                    <td className="px-4 py-2.5">
                      <Link href={`/financements/${d.id}`} className="font-semibold hover:text-accent-fort">
                        {d.financeurNom}
                      </Link>
                      <div className="text-[11.5px] text-texte-tenu">
                        {LIBELLE_FINANCEUR[d.financeurType]}
                        {d.reference ? ` · ${d.reference}` : ""}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-texte-doux">
                      {d.session ? (
                        <Link href={`/sessions/${d.session.id}`} className="hover:text-accent-fort">
                          {d.session.formation.titre} <span className="font-mono text-[11px]">{d.session.numero}</span>
                        </Link>
                      ) : (
                        "—"
                      )}
                      <div className="text-[11.5px] text-texte-tenu">
                        {[d.company?.raisonSociale, d.learner && `${d.learner.prenom} ${d.learner.nom}`].filter(Boolean).join(" · ")}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right font-mono tabular-nums">{d.montant ? formaterMontant(d.montant) : "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-texte-doux">{jour.format(d.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
