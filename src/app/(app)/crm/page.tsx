import type { StatutProspect } from "@prisma/client";
import Link from "next/link";

import { SelecteurStatut } from "@/app/(app)/crm/selecteur-statut";
import {
  formaterDate,
  formaterEuros,
  LIBELLE_SOURCE,
  LIBELLE_STATUT,
  STATUTS_ORDONNES,
  TON_STATUT,
} from "@/lib/crm-libelles";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";

export const dynamic = "force-dynamic";

/// Une piste « gagnée » ou « perdue » est close : elle sort des compteurs
/// mais reste affichée dans la liste, pour l'historique.
const EN_COURS: StatutProspect[] = STATUTS_ORDONNES.filter(
  (statut) => statut !== "GAGNE" && statut !== "PERDU",
);

export default async function PageCrm() {
  await exigerRole("ADMIN", "GESTIONNAIRE");

  const prospects = await prisma.prospect.findMany({
    where: { deletedAt: null },
    orderBy: [{ prochaineRelanceAt: "asc" }, { createdAt: "desc" }],
    include: { commercial: { select: { name: true } } },
  });

  const enCours = prospects.filter((p) => EN_COURS.includes(p.statut));
  const potentiel = enCours.reduce(
    (total, p) => total + Number(p.montantPotentiel ?? 0),
    0,
  );
  const aujourdhui = new Date();
  const relancesDues = enCours.filter(
    (p) => p.prochaineRelanceAt && p.prochaineRelanceAt <= aujourdhui,
  ).length;

  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight">CRM</h1>
          <p className="mt-1 text-[12.8px] text-texte-doux">
            Vos pistes commerciales et leur avancement.
          </p>
        </div>
        <Link
          href="/crm/nouveau"
          className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white"
        >
          Nouveau prospect
        </Link>
      </header>

      <section className="mb-4 grid gap-3.5 sm:grid-cols-3">
        <div className="rounded-xl border border-bordure bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-texte-tenu">
            Pistes en cours
          </div>
          <div className="mt-2 font-mono text-2xl font-semibold tabular-nums">
            {enCours.length}
          </div>
        </div>
        <div className="rounded-xl border border-bordure bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-texte-tenu">
            Potentiel estimé
          </div>
          <div className="mt-2 font-mono text-2xl font-semibold tabular-nums">
            {formaterEuros(potentiel)}
          </div>
        </div>
        <div className="rounded-xl border border-bordure bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-texte-tenu">
            Relances à faire
          </div>
          <div
            className={`mt-2 font-mono text-2xl font-semibold tabular-nums ${
              relancesDues > 0 ? "text-danger" : ""
            }`}
          >
            {relancesDues}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-bordure bg-surface shadow-sm">
        {prospects.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-texte-doux">
            Aucun prospect enregistré. Créez le premier avec le bouton ci-dessus.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12.8px]">
              <thead>
                <tr className="bg-surface-creuse text-left text-[10.8px] uppercase tracking-wider text-texte-tenu">
                  <th className="px-4 py-2.5 font-semibold">Prospect</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Source</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Potentiel</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Relance</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Statut</th>
                </tr>
              </thead>
              <tbody>
                {prospects.map((prospect) => {
                  const relanceDue =
                    prospect.prochaineRelanceAt &&
                    prospect.prochaineRelanceAt <= aujourdhui &&
                    EN_COURS.includes(prospect.statut);

                  return (
                    <tr
                      key={prospect.id}
                      className="border-t border-bordure-douce hover:bg-surface-creuse"
                    >
                      <td className="px-4 py-2.5">
                        <div className="font-semibold">
                          {prospect.prenom} {prospect.nom}
                        </div>
                        <div className="text-[11.5px] text-texte-tenu">
                          {[prospect.entreprise, prospect.email, prospect.telephone]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-texte-doux">
                        {LIBELLE_SOURCE[prospect.source]}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 font-mono tabular-nums">
                        {formaterEuros(prospect.montantPotentiel)}
                      </td>
                      <td
                        className={`whitespace-nowrap px-4 py-2.5 font-mono tabular-nums ${
                          relanceDue ? "font-semibold text-danger" : "text-texte-doux"
                        }`}
                      >
                        {formaterDate(prospect.prochaineRelanceAt)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <SelecteurStatut
                          id={prospect.id}
                          statut={prospect.statut}
                          classeTon={TON_STATUT[prospect.statut]}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {prospects.length > 0 && (
        <p className="mt-3 text-[11.5px] text-texte-tenu">
          Les statuts « {LIBELLE_STATUT.GAGNE} » et « {LIBELLE_STATUT.PERDU} » sortent
          des pistes en cours mais restent affichés pour conserver l&apos;historique.
        </p>
      )}
    </>
  );
}
