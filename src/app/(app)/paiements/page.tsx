import Link from "next/link";

import { enCentimes, formaterMontant, LIBELLE_MOYEN } from "@/lib/factures";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";
import { aujourdhuiUTC } from "@/lib/sessions-libelles";

export const dynamic = "force-dynamic";

const jour = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
const moisLong = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });

/// Encaissements d'un mois, pour le rapprochement avec le relevé bancaire.
export default async function PagePaiements({ searchParams }: { searchParams: Promise<{ mois?: string }> }) {
  await exigerRole("ADMIN", "GESTIONNAIRE");
  const { mois } = await searchParams;
  const aujourdhui = aujourdhuiUTC();
  const reference = mois && /^\d{4}-\d{2}$/.test(mois) ? new Date(`${mois}-01T00:00:00Z`) : new Date(Date.UTC(aujourdhui.getUTCFullYear(), aujourdhui.getUTCMonth(), 1));
  const debut = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1));
  const fin = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() + 1, 1));
  const cle = (d: Date) => d.toISOString().slice(0, 7);
  const precedent = cle(new Date(Date.UTC(debut.getUTCFullYear(), debut.getUTCMonth() - 1, 1)));
  const suivant = cle(fin);

  const paiements = await prisma.paiement.findMany({
    where: { date: { gte: debut, lt: fin } },
    orderBy: { date: "desc" },
    include: { facture: { select: { id: true, numero: true, payeurNom: true } } },
  });
  const total = paiements.reduce((t, p) => t + enCentimes(p.montant), 0);

  return (
    <>
      <header className="mb-6">
        <h1 className="text-[22px] font-extrabold tracking-tight">Paiements</h1>
        <p className="mt-1 text-[12.8px] text-texte-doux">Encaissements enregistrés sur les factures, mois par mois.</p>
      </header>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={`/paiements?mois=${precedent}`} aria-label="Mois précédent" className="rounded-lg border border-bordure bg-surface px-3 py-1.5 text-[13px] font-semibold">←</Link>
          <Link href={`/paiements?mois=${suivant}`} aria-label="Mois suivant" className="rounded-lg border border-bordure bg-surface px-3 py-1.5 text-[13px] font-semibold">→</Link>
          <h2 className="ml-2 text-[16px] font-bold first-letter:uppercase">{moisLong.format(debut)}</h2>
        </div>
        <p className="text-[13px]">
          Total encaissé : <strong className="font-mono">{formaterMontant(total / 100)}</strong>
        </p>
      </div>

      <section className="overflow-hidden rounded-xl border border-bordure bg-surface shadow-sm">
        {paiements.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-texte-doux">Aucun paiement enregistré ce mois-ci.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12.8px]">
              <thead>
                <tr className="bg-surface-creuse text-left text-[10.8px] uppercase tracking-wider text-texte-tenu">
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Date</th>
                  <th className="px-4 py-2.5 font-semibold">Facture</th>
                  <th className="px-4 py-2.5 font-semibold">Moyen</th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-right font-semibold">Montant</th>
                </tr>
              </thead>
              <tbody>
                {paiements.map((p) => (
                  <tr key={p.id} className="border-t border-bordure-douce hover:bg-surface-creuse">
                    <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">{jour.format(p.date)}</td>
                    <td className="px-4 py-2.5">
                      <Link href={`/factures/${p.facture.id}`} className="font-semibold hover:text-accent-fort">{p.facture.numero}</Link>
                      <div className="text-[11.5px] text-texte-tenu">{p.facture.payeurNom}</div>
                    </td>
                    <td className="px-4 py-2.5 text-texte-doux">
                      {LIBELLE_MOYEN[p.moyen]}
                      {p.reference ? ` · ${p.reference}` : ""}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right font-mono tabular-nums">{formaterMontant(p.montant)}</td>
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
