import Link from "next/link";

import { LIBELLE_STATUT_FORMATEUR } from "@/lib/formateurs";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";
import { aujourdhuiUTC } from "@/lib/sessions-libelles";

export const dynamic = "force-dynamic";

export default async function PageFormateurs({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; inactifs?: string }>;
}) {
  await exigerRole("ADMIN", "GESTIONNAIRE");

  const { q, inactifs } = await searchParams;
  const recherche = q?.trim() ?? "";
  const voirInactifs = inactifs === "1";
  const contient = { contains: recherche, mode: "insensitive" as const };

  const formateurs = await prisma.trainer.findMany({
    where: {
      deletedAt: null,
      ...(voirInactifs ? {} : { actif: true }),
      ...(recherche
        ? { OR: [{ nom: contient }, { prenom: contient }, { email: contient }, { specialites: contient }] }
        : {}),
    },
    orderBy: [{ nom: "asc" }, { prenom: "asc" }],
    include: {
      user: { select: { isActive: true } },
      _count: {
        select: {
          sessions: { where: { deletedAt: null, statut: { not: "ANNULEE" }, dateFin: { gte: aujourdhuiUTC() } } },
        },
      },
    },
  });

  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight">Formateurs</h1>
          <p className="mt-1 text-[12.8px] text-texte-doux">
            Les intervenants de vos sessions, salariés ou indépendants.
          </p>
        </div>
        <Link href="/formateurs/nouveau" className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white">
          Nouveau formateur
        </Link>
      </header>

      <form className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="search"
          name="q"
          defaultValue={recherche}
          placeholder="Nom, email, spécialité…"
          className="w-full max-w-xs rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent-pale"
        />
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" name="inactifs" value="1" defaultChecked={voirInactifs} />
          Afficher les inactifs
        </label>
        <button type="submit" className="rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] font-semibold">
          Filtrer
        </button>
      </form>

      <section className="overflow-hidden rounded-xl border border-bordure bg-surface shadow-sm">
        {formateurs.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-texte-doux">
            {recherche
              ? "Aucun formateur ne correspond à cette recherche."
              : "Aucun formateur enregistré. Créez le premier avec le bouton ci-dessus."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12.8px]">
              <thead>
                <tr className="bg-surface-creuse text-left text-[10.8px] uppercase tracking-wider text-texte-tenu">
                  <th className="px-4 py-2.5 font-semibold">Formateur</th>
                  <th className="px-4 py-2.5 font-semibold">Spécialités</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Statut</th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-right font-semibold">Sessions à venir</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Accès</th>
                </tr>
              </thead>
              <tbody>
                {formateurs.map((f) => (
                  <tr key={f.id} className="border-t border-bordure-douce hover:bg-surface-creuse">
                    <td className="px-4 py-2.5">
                      <Link href={`/formateurs/${f.id}`} className="font-semibold hover:text-accent-fort">
                        {f.prenom} {f.nom}
                      </Link>
                      {!f.actif && (
                        <span className="ml-2 rounded-full bg-surface-creuse px-2 py-0.5 text-[10.5px] font-semibold text-texte-tenu">
                          Inactif
                        </span>
                      )}
                      <div className="text-[11.5px] text-texte-tenu">
                        {[f.email, f.telephone].filter(Boolean).join(" · ") || "—"}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-texte-doux">{f.specialites ?? "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-texte-doux">{LIBELLE_STATUT_FORMATEUR[f.statut]}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right font-mono tabular-nums">{f._count.sessions}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-[12px]">
                      {f.user?.isActive ? (
                        <span className="font-semibold text-succes">Ouvert</span>
                      ) : (
                        <span className="text-texte-tenu">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {formateurs.length > 0 && (
        <p className="mt-3 text-[11.5px] text-texte-tenu">
          {formateurs.length} formateur{formateurs.length > 1 ? "s" : ""}.
        </p>
      )}
    </>
  );
}
