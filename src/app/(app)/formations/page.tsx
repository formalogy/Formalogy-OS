import type { StatutFormation } from "@prisma/client";
import Link from "next/link";

import { formaterEuros } from "@/lib/crm-libelles";
import {
  formaterDuree,
  LIBELLE_MODALITE,
  LIBELLE_STATUT_FORMATION,
  STATUTS_FORMATION,
  TON_STATUT_FORMATION,
} from "@/lib/formations-libelles";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function PageFormations({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; categorie?: string; statut?: string }>;
}) {
  await exigerRole("ADMIN", "GESTIONNAIRE");

  const { q, categorie, statut } = await searchParams;
  const recherche = q?.trim() ?? "";
  const filtreStatut = STATUTS_FORMATION.includes(statut as StatutFormation)
    ? (statut as StatutFormation)
    : undefined;

  const [categories, formations] = await Promise.all([
    prisma.formationCategory.findMany({ orderBy: { ordre: "asc" } }),
    prisma.formation.findMany({
      where: {
        deletedAt: null,
        ...(filtreStatut ? { statut: filtreStatut } : {}),
        ...(categorie ? { categoryId: categorie } : {}),
        ...(recherche
          ? {
              OR: [
                { titre: { contains: recherche, mode: "insensitive" } },
                { reference: { contains: recherche, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: [{ category: { ordre: "asc" } }, { titre: "asc" }],
      include: { category: { select: { nom: true } } },
    }),
  ]);

  const filtresActifs = Boolean(recherche || filtreStatut || categorie);

  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight">Formations</h1>
          <p className="mt-1 text-[12.8px] text-texte-doux">
            Votre catalogue : ce que vous proposez, à quel prix, pour quelle durée.
          </p>
        </div>
        <Link
          href="/formations/nouvelle"
          className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white"
        >
          Nouvelle formation
        </Link>
      </header>

      <form className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="search"
          name="q"
          defaultValue={recherche}
          placeholder="Titre ou référence…"
          className="w-full max-w-xs rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent-pale"
        />
        <select
          name="categorie"
          defaultValue={categorie ?? ""}
          className="rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent"
        >
          <option value="">Toutes les catégories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nom}
            </option>
          ))}
        </select>
        <select
          name="statut"
          defaultValue={filtreStatut ?? ""}
          className="rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent"
        >
          <option value="">Tous les statuts</option>
          {STATUTS_FORMATION.map((s) => (
            <option key={s} value={s}>
              {LIBELLE_STATUT_FORMATION[s]}
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
        {formations.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-texte-doux">
            {filtresActifs
              ? "Aucune formation ne correspond à ces critères."
              : "Le catalogue est vide. Ajoutez votre première formation avec le bouton ci-dessus."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12.8px]">
              <thead>
                <tr className="bg-surface-creuse text-left text-[10.8px] uppercase tracking-wider text-texte-tenu">
                  <th className="px-4 py-2.5 font-semibold">Formation</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Catégorie</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Modalité</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Durée</th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-right font-semibold">Prix HT</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Statut</th>
                </tr>
              </thead>
              <tbody>
                {formations.map((formation) => (
                  <tr
                    key={formation.id}
                    className="border-t border-bordure-douce hover:bg-surface-creuse"
                  >
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/formations/${formation.id}`}
                        className="font-semibold hover:text-accent-fort"
                      >
                        {formation.titre}
                      </Link>
                      <div className="font-mono text-[11px] text-texte-tenu">
                        {formation.reference}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-texte-doux">
                      {formation.category?.nom ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-texte-doux">
                      {LIBELLE_MODALITE[formation.modalite]}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono tabular-nums text-texte-doux">
                      {formaterDuree(formation.dureeHeures, formation.dureeJours)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right font-mono tabular-nums">
                      {formaterEuros(formation.prixHT)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <span
                        className={`inline-block rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${
                          TON_STATUT_FORMATION[formation.statut]
                        }`}
                      >
                        {LIBELLE_STATUT_FORMATION[formation.statut]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {formations.length > 0 && (
        <p className="mt-3 text-[11.5px] text-texte-tenu">
          {formations.length} formation{formations.length > 1 ? "s" : ""}.
        </p>
      )}
    </>
  );
}
