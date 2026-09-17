import type { StatutSignature } from "@prisma/client";
import Link from "next/link";

import { classerEmailEntrant } from "@/app/(app)/signatures/actions";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";
import { ajouterJours, aujourdhuiUTC } from "@/lib/sessions-libelles";
import { LIBELLE_STATUT_SIGNATURE, TON_STATUT_SIGNATURE, type Signataire } from "@/lib/signatures/libelles";

export const dynamic = "force-dynamic";

const STATUTS: StatutSignature[] = ["A_ENVOYER", "ENVOYEE", "SIGNEE", "ANNULEE"];

const jour = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Paris" });

export default async function PageSignatures({ searchParams }: { searchParams: Promise<{ statut?: string }> }) {
  await exigerRole("ADMIN", "GESTIONNAIRE");
  const params = await searchParams;
  // Par défaut : ce qui demande une action ou une attente.
  const filtre = STATUTS.includes(params.statut as StatutSignature) ? [params.statut as StatutSignature] : ["A_ENVOYER", "ENVOYEE"] as StatutSignature[];

  const [demandes, aVerifier] = await Promise.all([
    prisma.signatureRequest.findMany({
      where: { statut: { in: filtre }, document: { deletedAt: null } },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { document: { select: { id: true, nom: true, session: { select: { numero: true } } } } },
    }),
    prisma.emailEntrant.findMany({ where: { resultat: "A_VERIFIER" }, orderBy: { recuAt: "desc" }, take: 20 }),
  ]);

  // Un envoi sans réponse depuis plus de 10 jours mérite une relance.
  const seuilRelance = ajouterJours(aujourdhuiUTC(), -10);

  return (
    <>
      <header className="mb-6">
        <h1 className="text-[22px] font-extrabold tracking-tight">Signatures</h1>
        <p className="mt-1 text-[12.8px] text-texte-doux">
          Documents envoyés à la signature via BoldSign. Pour en lancer une, ouvrez le document concerné.
        </p>
      </header>

      <div className="mb-4 flex flex-wrap gap-1 rounded-lg border border-bordure bg-surface p-0.5 sm:inline-flex">
        <Link href="/signatures" className={`rounded-md px-3 py-1 text-[12.5px] font-semibold ${!params.statut ? "bg-accent-pale text-accent-fort" : "text-texte-doux"}`}>
          En cours
        </Link>
        {STATUTS.map((s) => (
          <Link key={s} href={`/signatures?statut=${s}`} className={`rounded-md px-3 py-1 text-[12.5px] font-semibold ${params.statut === s ? "bg-accent-pale text-accent-fort" : "text-texte-doux"}`}>
            {LIBELLE_STATUT_SIGNATURE[s]}
          </Link>
        ))}
      </div>

      {aVerifier.length > 0 && (
        <section className="mb-4 rounded-xl border border-alerte/40 bg-alerte/12 p-4">
          <h2 className="text-[13.5px] font-bold text-alerte">Emails BoldSign à vérifier ({aVerifier.length})</h2>
          <p className="mb-2 text-[12px] text-texte-doux">
            Ces documents signés n&apos;ont pas pu être rattachés automatiquement : récupérez-les dans la boîte email et déposez-les à la main sur le bon document.
          </p>
          <ul className="flex flex-col gap-1">
            {aVerifier.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
                <span>
                  <span className="font-semibold">{e.sujet}</span>{" "}
                  <span className="text-texte-tenu">· reçu le {jour.format(e.recuAt)} · {e.motif}</span>
                </span>
                <form action={classerEmailEntrant}>
                  <input type="hidden" name="id" value={e.id} />
                  <button type="submit" className="rounded-lg border border-bordure bg-surface px-2.5 py-1 text-[12px] font-semibold">
                    C&apos;est réglé
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="overflow-hidden rounded-xl border border-bordure bg-surface shadow-sm">
        {demandes.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-texte-doux">Aucune signature dans cette catégorie.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12.8px]">
              <thead>
                <tr className="bg-surface-creuse text-left text-[10.8px] uppercase tracking-wider text-texte-tenu">
                  <th className="px-4 py-2.5 font-semibold">Document</th>
                  <th className="px-4 py-2.5 font-semibold">Signataires</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Date</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Statut</th>
                </tr>
              </thead>
              <tbody>
                {demandes.map((d) => {
                  const date = d.signeeAt ?? d.annuleeAt ?? d.envoyeeAt ?? d.createdAt;
                  const ancienne = d.statut === "ENVOYEE" && d.envoyeeAt !== null && d.envoyeeAt < seuilRelance;
                  return (
                    <tr key={d.id} className="border-t border-bordure-douce hover:bg-surface-creuse">
                      <td className="px-4 py-2.5">
                        <Link href={`/documents/${d.document.id}`} className="font-semibold hover:text-accent-fort">
                          {d.document.nom}
                        </Link>
                        <div className="font-mono text-[11px] text-texte-tenu">
                          {d.reference}
                          {d.document.session ? ` · ${d.document.session.numero}` : ""}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-texte-doux">{(d.signataires as Signataire[]).map((s) => s.nom).join(", ")}</td>
                      <td className={`whitespace-nowrap px-4 py-2.5 tabular-nums ${ancienne ? "font-semibold text-alerte" : ""}`}>
                        {jour.format(date)}
                        {ancienne && " · à relancer"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <span className={`inline-block rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${TON_STATUT_SIGNATURE[d.statut]}`}>
                          {LIBELLE_STATUT_SIGNATURE[d.statut]}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
