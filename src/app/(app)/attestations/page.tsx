import Link from "next/link";

import { nomFormateur } from "@/lib/formateurs";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";
import { ajouterJours, aujourdhuiUTC, formaterPeriode } from "@/lib/sessions-libelles";

export const dynamic = "force-dynamic";

/// Sessions terminées depuis moins de 6 mois : évaluations et attestations.
export default async function PageAttestations() {
  await exigerRole("ADMIN", "GESTIONNAIRE");
  const aujourdhui = aujourdhuiUTC();

  const sessions = await prisma.trainingSession.findMany({
    where: {
      deletedAt: null,
      statut: { notIn: ["BROUILLON", "ANNULEE"] },
      dateFin: { lte: aujourdhui, gte: ajouterJours(aujourdhui, -183) },
    },
    orderBy: { dateFin: "desc" },
    select: {
      id: true,
      numero: true,
      dateDebut: true,
      dateFin: true,
      formation: { select: { titre: true } },
      trainer: { select: { prenom: true, nom: true } },
      _count: {
        select: {
          inscriptions: { where: { learner: { deletedAt: null } } },
          evaluations: true,
          documents: { where: { deletedAt: null, type: { code: "ATTESTATION" } } },
        },
      },
    },
  });

  const cellule = (fait: number, total: number) => (
    <td className={`whitespace-nowrap px-4 py-2.5 font-mono tabular-nums ${total > 0 && fait >= total ? "text-succes" : "font-semibold text-alerte"}`}>
      {fait} / {total}
    </td>
  );

  return (
    <>
      <header className="mb-6">
        <h1 className="text-[22px] font-extrabold tracking-tight">Attestations</h1>
        <p className="mt-1 text-[12.8px] text-texte-doux">
          Sessions terminées depuis moins de 6 mois : évaluations des acquis, attestations de fin de formation et certificats de réalisation.
        </p>
      </header>

      <section className="overflow-hidden rounded-xl border border-bordure bg-surface shadow-sm">
        {sessions.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-texte-doux">Aucune session terminée récemment.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12.8px]">
              <thead>
                <tr className="bg-surface-creuse text-left text-[10.8px] uppercase tracking-wider text-texte-tenu">
                  <th className="px-4 py-2.5 font-semibold">Session</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Formateur</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Évaluations</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Attestations</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id} className="border-t border-bordure-douce hover:bg-surface-creuse">
                    <td className="px-4 py-2.5">
                      <Link href={`/sessions/${s.id}/fin-de-formation`} className="font-semibold hover:text-accent-fort">
                        {s.formation.titre}
                      </Link>
                      <div className="text-[11.5px] text-texte-tenu">
                        <span className="font-mono">{s.numero}</span> · {formaterPeriode(s.dateDebut, s.dateFin)}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-texte-doux">{nomFormateur(s.trainer) ?? "—"}</td>
                    {cellule(s._count.evaluations, s._count.inscriptions)}
                    {cellule(s._count.documents, s._count.inscriptions)}
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
