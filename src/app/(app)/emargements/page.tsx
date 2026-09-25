import Link from "next/link";

import { nombreAbsences } from "@/lib/emargement";
import { nomFormateur } from "@/lib/formateurs";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";
import { ajouterJours, aujourdhuiUTC, formaterPeriode } from "@/lib/sessions-libelles";

export const dynamic = "force-dynamic";

/// Sessions en cours ou terminées depuis moins de 30 jours, avec l'avancement
/// de la saisie des présences et la présence d'une feuille signée.
export default async function PageEmargements() {
  await exigerRole("ADMIN", "GESTIONNAIRE");
  const aujourdhui = aujourdhuiUTC();

  const sessions = await prisma.trainingSession.findMany({
    where: {
      deletedAt: null,
      statut: { notIn: ["BROUILLON", "ANNULEE"] },
      dateDebut: { lte: aujourdhui },
      dateFin: { gte: ajouterJours(aujourdhui, -30) },
    },
    orderBy: { dateDebut: "desc" },
    select: {
      id: true,
      numero: true,
      dateDebut: true,
      dateFin: true,
      formation: { select: { titre: true } },
      trainer: { select: { prenom: true, nom: true } },
      inscriptions: { where: { learner: { deletedAt: null } }, select: { learnerId: true } },
      presences: { where: { statut: { not: "PRESENT" } }, select: { statut: true } },
      _count: { select: { documents: { where: { deletedAt: null, type: { code: "EMARGEMENT" } } } } },
    },
  });

  return (
    <>
      <header className="mb-6">
        <h1 className="text-[22px] font-extrabold tracking-tight">Émargements</h1>
        <p className="mt-1 text-[12.8px] text-texte-doux">
          Sessions en cours ou terminées depuis moins de 30 jours : présences à reporter et feuilles signées à déposer.
        </p>
      </header>

      <section className="overflow-hidden rounded-xl border border-bordure bg-surface shadow-sm">
        {sessions.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-texte-doux">Aucune session en cours ni récemment terminée.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12.8px]">
              <thead>
                <tr className="bg-surface-creuse text-left text-[10.8px] uppercase tracking-wider text-texte-tenu">
                  <th className="px-4 py-2.5 font-semibold">Session</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Formateur</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Absences signalées</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Feuille signée</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => {
                  const absences = nombreAbsences(s.presences);
                  return (
                    <tr key={s.id} className="border-t border-bordure-douce hover:bg-surface-creuse">
                      <td className="px-4 py-2.5">
                        <Link href={`/sessions/${s.id}/emargement`} className="font-semibold hover:text-accent-fort">
                          {s.formation.titre}
                        </Link>
                        <div className="text-[11.5px] text-texte-tenu">
                          <span className="font-mono">{s.numero}</span> · {formaterPeriode(s.dateDebut, s.dateFin)}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-texte-doux">{nomFormateur(s.trainer) ?? "—"}</td>
                      <td className={`whitespace-nowrap px-4 py-2.5 font-mono tabular-nums ${absences ? "font-semibold text-alerte" : "text-texte-tenu"}`}>
                        {s.dateDebut > aujourdhui ? "—" : absences}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        {s._count.documents > 0 ? (
                          <span className="font-semibold text-succes">Déposée</span>
                        ) : (
                          <Link href={`/documents/nouveau?session=${s.id}&type=EMARGEMENT`} className="font-semibold text-alerte hover:underline">
                            À déposer
                          </Link>
                        )}
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
