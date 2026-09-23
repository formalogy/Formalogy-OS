import type { StatutApprenant } from "@prisma/client";
import Link from "next/link";

import { Avatar } from "@/app/(app)/_composants/avatar";
import {
  LIBELLE_FINANCEMENT,
  LIBELLE_STATUT_APPRENANT,
  STATUTS_APPRENANT,
  TON_STATUT_APPRENANT,
} from "@/lib/apprenants-libelles";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function PageApprenants({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; statut?: string }>;
}) {
  await exigerRole("ADMIN", "GESTIONNAIRE");

  const { q, statut } = await searchParams;
  const recherche = q?.trim() ?? "";
  const filtre = STATUTS_APPRENANT.includes(statut as StatutApprenant)
    ? (statut as StatutApprenant)
    : undefined;

  const apprenants = await prisma.learner.findMany({
    where: {
      deletedAt: null,
      ...(filtre ? { statut: filtre } : {}),
      ...(recherche
        ? {
            OR: [
              { nom: { contains: recherche, mode: "insensitive" } },
              { prenom: { contains: recherche, mode: "insensitive" } },
              { email: { contains: recherche, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ nom: "asc" }, { prenom: "asc" }],
    include: { company: { select: { raisonSociale: true } } },
  });

  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight">Apprenants</h1>
          <p className="mt-1 text-[12.8px] text-texte-doux">
            Les personnes que vous formez. Elles n&apos;ont pas de compte sur
            l&apos;application.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Link
            href="/apprenants/nouveau"
            className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white"
          >
            Nouvel apprenant
          </Link>
          <Link
            href="/entreprises/nouvelle"
            className="rounded-lg border border-bordure bg-surface px-4 py-2 text-[13px] font-semibold text-texte-doux"
          >
            Nouvelle entreprise
          </Link>
        </div>
      </header>

      <form className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="search"
          name="q"
          defaultValue={recherche}
          placeholder="Rechercher un nom, un email…"
          className="w-full max-w-xs rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent-pale"
        />
        <select
          name="statut"
          defaultValue={filtre ?? ""}
          className="rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent"
        >
          <option value="">Tous les statuts</option>
          {STATUTS_APPRENANT.map((valeur) => (
            <option key={valeur} value={valeur}>
              {LIBELLE_STATUT_APPRENANT[valeur]}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] font-semibold"
        >
          Filtrer
        </button>
      </form>

      <section className="overflow-hidden rounded-xl border border-bordure bg-surface shadow-sm">
        {apprenants.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-texte-doux">
            {recherche || filtre
              ? "Aucun apprenant ne correspond à cette recherche."
              : "Aucun apprenant enregistré. Créez le premier avec le bouton ci-dessus."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12.8px]">
              <thead>
                <tr className="bg-surface-creuse text-left text-[10.8px] uppercase tracking-wider text-texte-tenu">
                  <th className="px-4 py-2.5 font-semibold">Apprenant</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Entreprise</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Financement</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Statut</th>
                </tr>
              </thead>
              <tbody>
                {apprenants.map((apprenant) => (
                  <tr
                    key={apprenant.id}
                    className="border-t border-bordure-douce hover:bg-surface-creuse"
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <Avatar
                          prenom={apprenant.prenom}
                          nom={apprenant.nom}
                          photoUrl={apprenant.photoCheminStockage || apprenant.email ? `/api/apprenants/${apprenant.id}/photo` : null}
                        />
                        <div className="min-w-0">
                          <Link
                            href={`/apprenants/${apprenant.id}`}
                            className="font-semibold hover:text-accent-fort"
                          >
                            {apprenant.prenom} {apprenant.nom}
                          </Link>
                          <div className="text-[11.5px] text-texte-tenu">
                            {[apprenant.email, apprenant.telephone].filter(Boolean).join(" · ") ||
                              "—"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-texte-doux">
                      {apprenant.company?.raisonSociale ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-texte-doux">
                      {LIBELLE_FINANCEMENT[apprenant.financement]}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <span
                        className={`inline-block rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${
                          TON_STATUT_APPRENANT[apprenant.statut]
                        }`}
                      >
                        {LIBELLE_STATUT_APPRENANT[apprenant.statut]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {apprenants.length > 0 && (
        <p className="mt-3 text-[11.5px] text-texte-tenu">
          {apprenants.length} apprenant{apprenants.length > 1 ? "s" : ""}.
        </p>
      )}
    </>
  );
}
