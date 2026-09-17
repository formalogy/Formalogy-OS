import type { StatutDossier } from "@prisma/client";
import Link from "next/link";

import { enCentimes, formaterMontant } from "@/lib/factures";
import { alerteDossier, LIBELLE_FINANCEUR, LIBELLE_STATUT_DOSSIER, STATUTS_DOSSIER, TON_STATUT_DOSSIER } from "@/lib/financements";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";
import { aujourdhuiUTC } from "@/lib/sessions-libelles";

export const dynamic = "force-dynamic";

const jour = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });

export default async function PageFinancements({ searchParams }: { searchParams: Promise<{ statut?: string }> }) {
  await exigerRole("ADMIN", "GESTIONNAIRE");
  const params = await searchParams;
  const filtre = STATUTS_DOSSIER.includes(params.statut as StatutDossier)
    ? [params.statut as StatutDossier]
    : (["A_MONTER", "DEPOSE"] as StatutDossier[]);
  const aujourdhui = aujourdhuiUTC();

  const dossiers = await prisma.dossierFinancement.findMany({
    where: { statut: { in: filtre } },
    orderBy: [{ dateLimite: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    take: 300,
    include: {
      session: { select: { id: true, numero: true, formation: { select: { titre: true } } } },
      company: { select: { raisonSociale: true } },
      learner: { select: { prenom: true, nom: true } },
    },
  });

  const avecAlerte = dossiers.map((d) => ({ d, alerte: alerteDossier(d, aujourdhui) }));
  const attendu = dossiers
    .filter((d) => d.statut === "ACCORDE" || d.statut === "DEPOSE")
    .reduce((t, d) => t + enCentimes(d.montantAccorde ?? d.montantDemande ?? 0), 0);

  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight">Prises en charge</h1>
          <p className="mt-1 text-[12.8px] text-texte-doux">
            Dossiers OPCO, France Travail et CPF : dépôts, accords et montants financés.
          </p>
        </div>
        <Link href="/financements/nouveau" className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white">
          Nouveau dossier
        </Link>
      </header>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-lg border border-bordure bg-surface p-0.5">
          <Link href="/financements" className={`rounded-md px-3 py-1 text-[12.5px] font-semibold ${!params.statut ? "bg-accent-pale text-accent-fort" : "text-texte-doux"}`}>
            En cours
          </Link>
          {STATUTS_DOSSIER.map((s) => (
            <Link key={s} href={`/financements?statut=${s}`} className={`rounded-md px-3 py-1 text-[12.5px] font-semibold ${params.statut === s ? "bg-accent-pale text-accent-fort" : "text-texte-doux"}`}>
              {LIBELLE_STATUT_DOSSIER[s]}
            </Link>
          ))}
        </div>
        {attendu > 0 && (
          <p className="text-[12.5px]">
            Financement attendu : <strong className="font-mono">{formaterMontant(attendu / 100)}</strong>
          </p>
        )}
      </div>

      <section className="overflow-hidden rounded-xl border border-bordure bg-surface shadow-sm">
        {dossiers.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-texte-doux">
            Aucun dossier dans cette catégorie. Créez-en un depuis une session ou avec le bouton ci-dessus.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12.8px]">
              <thead>
                <tr className="bg-surface-creuse text-left text-[10.8px] uppercase tracking-wider text-texte-tenu">
                  <th className="px-4 py-2.5 font-semibold">Financeur</th>
                  <th className="px-4 py-2.5 font-semibold">Rattachement</th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-right font-semibold">Demandé</th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-right font-semibold">Accordé</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Échéance</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Statut</th>
                </tr>
              </thead>
              <tbody>
                {avecAlerte.map(({ d, alerte }) => (
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
                    <td className="whitespace-nowrap px-4 py-2.5 text-right font-mono tabular-nums">{d.montantDemande ? formaterMontant(d.montantDemande) : "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right font-mono tabular-nums">{d.montantAccorde ? formaterMontant(d.montantAccorde) : "—"}</td>
                    <td className={`whitespace-nowrap px-4 py-2.5 tabular-nums ${alerte ? "font-semibold text-alerte" : "text-texte-doux"}`}>
                      {d.dateLimite ? jour.format(d.dateLimite) : "—"}
                      {alerte && <div className="text-[11px] font-normal">{alerte}</div>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <span className={`inline-block rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${TON_STATUT_DOSSIER[d.statut]}`}>
                        {LIBELLE_STATUT_DOSSIER[d.statut]}
                      </span>
                    </td>
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
