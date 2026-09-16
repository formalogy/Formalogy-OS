import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function PageEntreprises({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await exigerRole("ADMIN", "GESTIONNAIRE");

  const { q } = await searchParams;
  const recherche = q?.trim() ?? "";

  const entreprises = await prisma.company.findMany({
    where: {
      deletedAt: null,
      ...(recherche
        ? {
            OR: [
              { raisonSociale: { contains: recherche, mode: "insensitive" } },
              { ville: { contains: recherche, mode: "insensitive" } },
              { siret: { contains: recherche.replace(/\s/g, "") } },
            ],
          }
        : {}),
    },
    orderBy: { raisonSociale: "asc" },
    include: { _count: { select: { contacts: { where: { deletedAt: null } } } } },
  });

  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight">Entreprises</h1>
          <p className="mt-1 text-[12.8px] text-texte-doux">
            Vos clients et leurs interlocuteurs.
          </p>
        </div>
        <Link
          href="/entreprises/nouvelle"
          className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white"
        >
          Nouvelle entreprise
        </Link>
      </header>

      <form className="mb-4">
        <input
          type="search"
          name="q"
          defaultValue={recherche}
          placeholder="Rechercher une entreprise, une ville, un SIRET…"
          className="w-full max-w-md rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent-pale"
        />
      </form>

      <section className="overflow-hidden rounded-xl border border-bordure bg-surface shadow-sm">
        {entreprises.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-texte-doux">
            {recherche
              ? `Aucune entreprise ne correspond à « ${recherche} ».`
              : "Aucune entreprise enregistrée. Créez la première avec le bouton ci-dessus."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12.8px]">
              <thead>
                <tr className="bg-surface-creuse text-left text-[10.8px] uppercase tracking-wider text-texte-tenu">
                  <th className="px-4 py-2.5 font-semibold">Raison sociale</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Ville</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">SIRET</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Contacts</th>
                </tr>
              </thead>
              <tbody>
                {entreprises.map((entreprise) => (
                  <tr
                    key={entreprise.id}
                    className="border-t border-bordure-douce hover:bg-surface-creuse"
                  >
                    <td className="px-4 py-2.5 font-semibold">
                      <Link
                        href={`/entreprises/${entreprise.id}`}
                        className="hover:text-accent-fort"
                      >
                        {entreprise.raisonSociale}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-texte-doux">
                      {entreprise.ville ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[11.5px] tabular-nums text-texte-doux">
                      {entreprise.siret ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono tabular-nums text-texte-doux">
                      {entreprise._count.contacts}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {entreprises.length > 0 && (
        <p className="mt-3 text-[11.5px] text-texte-tenu">
          {entreprises.length} entreprise{entreprises.length > 1 ? "s" : ""}
          {recherche ? " correspondant à la recherche" : ""}.
        </p>
      )}
    </>
  );
}
