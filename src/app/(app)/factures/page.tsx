import type { Prisma } from "@prisma/client";
import Link from "next/link";

import { formaterMontant, LIBELLE_STATUT_FACTURE, situationFacture, TON_STATUT_FACTURE } from "@/lib/factures";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";
import { ajouterJours, aujourdhuiUTC, formaterPeriode } from "@/lib/sessions-libelles";

export const dynamic = "force-dynamic";

const FILTRES = {
  a_emettre: "À émettre",
  impayees: "En attente de paiement",
  retard: "En retard",
  payees: "Payées",
  toutes: "Toutes",
} as const;
type Filtre = keyof typeof FILTRES;

const jour = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });

export default async function PageFactures({ searchParams }: { searchParams: Promise<{ filtre?: string }> }) {
  await exigerRole("ADMIN", "GESTIONNAIRE");
  const params = await searchParams;
  const filtre: Filtre = params.filtre && params.filtre in FILTRES ? (params.filtre as Filtre) : "impayees";
  const aujourdhui = aujourdhuiUTC();

  const where: Prisma.FactureWhereInput = {
    a_emettre: { statut: "A_EMETTRE" as const },
    impayees: { statut: "EMISE" as const },
    retard: { statut: "EMISE" as const, dateEcheance: { lt: aujourdhui } },
    payees: { statut: "PAYEE" as const },
    toutes: {},
  }[filtre];

  const [factures, aFacturer] = await Promise.all([
    prisma.facture.findMany({
      where,
      orderBy: [{ dateEcheance: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      take: 300,
      include: { paiements: { select: { montant: true } }, session: { select: { numero: true } } },
    }),
    // Sessions terminées depuis moins d'un an, sans facture active.
    prisma.trainingSession.findMany({
      where: {
        deletedAt: null,
        statut: { notIn: ["BROUILLON", "ANNULEE"] },
        dateFin: { lte: aujourdhui, gte: ajouterJours(aujourdhui, -365) },
        factures: { none: { statut: { not: "ANNULEE" } } },
      },
      orderBy: { dateFin: "asc" },
      take: 50,
      select: { id: true, numero: true, dateDebut: true, dateFin: true, prixHT: true, formation: { select: { titre: true } }, company: { select: { raisonSociale: true } } },
    }),
  ]);

  const situations = factures.map((f) => ({ f, s: situationFacture(f, f.paiements, aujourdhui) }));
  const totalReste = situations.reduce((t, x) => t + x.s.resteCentimes, 0);

  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight">Factures</h1>
          <p className="mt-1 text-[12.8px] text-texte-doux">
            Préparées ici, émises dans Henrri, suivies jusqu&apos;au paiement.
          </p>
        </div>
        <Link href="/factures/nouvelle" className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white">
          Préparer une facture
        </Link>
      </header>

      {aFacturer.length > 0 && (
        <section className="mb-4 rounded-xl border border-alerte/40 bg-alerte/12 p-4">
          <h2 className="mb-2 text-[13.5px] font-bold text-alerte">Sessions terminées à facturer ({aFacturer.length})</h2>
          <ul className="flex flex-col gap-1.5">
            {aFacturer.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
                <span>
                  <span className="font-semibold">{s.formation.titre}</span>{" "}
                  <span className="text-texte-doux">
                    · {s.numero} · {formaterPeriode(s.dateDebut, s.dateFin)} · {s.company?.raisonSociale ?? "Inter-entreprises"}
                    {s.prixHT ? ` · ${formaterMontant(s.prixHT)} HT` : ""}
                  </span>
                </span>
                <Link href={`/factures/nouvelle?session=${s.id}`} className="rounded-lg border border-bordure bg-surface px-2.5 py-1 text-[12px] font-semibold">
                  Préparer la facture
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-lg border border-bordure bg-surface p-0.5">
          {Object.entries(FILTRES).map(([cle, libelle]) => (
            <Link key={cle} href={`/factures?filtre=${cle}`} className={`rounded-md px-3 py-1 text-[12.5px] font-semibold ${filtre === cle ? "bg-accent-pale text-accent-fort" : "text-texte-doux"}`}>
              {libelle}
            </Link>
          ))}
        </div>
        {(filtre === "impayees" || filtre === "retard") && factures.length > 0 && (
          <p className="text-[12.5px]">
            Reste à encaisser : <strong className="font-mono">{formaterMontant(totalReste / 100)}</strong>
          </p>
        )}
      </div>

      <section className="overflow-hidden rounded-xl border border-bordure bg-surface shadow-sm">
        {factures.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-texte-doux">Aucune facture dans cette catégorie.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12.8px]">
              <thead>
                <tr className="bg-surface-creuse text-left text-[10.8px] uppercase tracking-wider text-texte-tenu">
                  <th className="px-4 py-2.5 font-semibold">Facture</th>
                  <th className="px-4 py-2.5 font-semibold">Payeur</th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-right font-semibold">TTC</th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-right font-semibold">Reste dû</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Échéance</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Statut</th>
                </tr>
              </thead>
              <tbody>
                {situations.map(({ f, s }) => (
                  <tr key={f.id} className="border-t border-bordure-douce hover:bg-surface-creuse">
                    <td className="px-4 py-2.5">
                      <Link href={`/factures/${f.id}`} className="font-semibold hover:text-accent-fort">
                        {f.numero ?? "À émettre"}
                      </Link>
                      <div className="text-[11.5px] text-texte-tenu">
                        {f.objet}
                        {f.session ? ` · ${f.session.numero}` : ""}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-texte-doux">{f.payeurNom}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right font-mono tabular-nums">{formaterMontant(f.montantTTC)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right font-mono tabular-nums">{f.statut === "EMISE" ? formaterMontant(s.resteCentimes / 100) : "—"}</td>
                    <td className={`whitespace-nowrap px-4 py-2.5 tabular-nums ${s.enRetard ? "font-semibold text-danger" : "text-texte-doux"}`}>
                      {f.dateEcheance ? jour.format(f.dateEcheance) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <span className={`inline-block rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${TON_STATUT_FACTURE[f.statut]}`}>
                        {LIBELLE_STATUT_FACTURE[f.statut]}
                        {s.enRetard && " · retard"}
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
