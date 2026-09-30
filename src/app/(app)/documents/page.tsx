import Link from "next/link";

import { FILTRE_BIBLIOTHEQUE } from "@/lib/bibliotheque";
import { formaterTaille, LIBELLE_STATUT_DOCUMENT, TON_STATUT_DOCUMENT } from "@/lib/documents-libelles";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";
import { QUOTA_STOCKAGE_OCTETS, stockageConfigure } from "@/lib/stockage";

export const dynamic = "force-dynamic";

const dateCourte = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Paris" });

/// Bibliothèque : les documents administratifs des sessions de formation
/// (voir lib/bibliotheque.ts). Les documents d'une personne ou d'une
/// entreprise se consultent dans sa fiche.
export default async function PageBibliotheque({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; archives?: string }>;
}) {
  await exigerRole("ADMIN", "GESTIONNAIRE");

  const params = await searchParams;
  const recherche = params.q?.trim() ?? "";
  const avecArchives = params.archives === "1";

  const [documents, types, occupation] = await Promise.all([
    prisma.document.findMany({
      where: {
        deletedAt: null,
        ...FILTRE_BIBLIOTHEQUE,
        ...(avecArchives ? {} : { statut: { not: "ARCHIVE" } }),
        ...(params.type ? { typeId: params.type } : {}),
        ...(recherche ? { nom: { contains: recherche, mode: "insensitive" } } : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: 300,
      include: {
        type: { select: { nom: true } },
        formation: { select: { titre: true } },
        versions: { orderBy: { numero: "desc" }, take: 1, select: { numero: true, taille: true } },
      },
    }),
    // Types proposés au filtre : ceux des documents rangés dans la bibliothèque.
    prisma.documentType.findMany({
      where: { documents: { some: { deletedAt: null, ...FILTRE_BIBLIOTHEQUE } } },
      orderBy: { ordre: "asc" },
    }),
    // Toutes les versions occupent de la place, y compris celles des
    // documents supprimés : leurs fichiers sont conservés.
    prisma.documentVersion.aggregate({ _sum: { taille: true } }),
  ]);

  const octetsUtilises = occupation._sum.taille ?? 0;
  const pourcentage = Math.min(100, (octetsUtilises / QUOTA_STOCKAGE_OCTETS) * 100);
  const tonJauge = pourcentage >= 90 ? "bg-danger" : pourcentage >= 70 ? "bg-alerte" : "bg-accent";

  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight">Bibliothèque</h1>
          <p className="mt-1 max-w-2xl text-[12.8px] text-texte-doux">
            Les documents administratifs de référence : modèles de convention, programmes… Les documents d&apos;une session
            (feuilles d&apos;émargement, bilans…) se trouvent dans la session ; ceux d&apos;une personne ou d&apos;une entreprise (CV,
            pièce d&apos;identité, convention d&apos;un apprenant…) uniquement dans sa fiche.
          </p>
        </div>
        <Link href="/documents/nouveau" className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white">
          Déposer un document
        </Link>
      </header>

      {!stockageConfigure() && (
        <p className="mb-4 rounded-lg bg-alerte/12 px-3 py-2 text-[12.5px] text-alerte">
          Le stockage des fichiers n&apos;est pas encore configuré. La bibliothèque est consultable, mais
          aucun fichier ne pourra être déposé ni ouvert tant que la clé Supabase n&apos;est pas renseignée.
        </p>
      )}

      <section className="mb-4 rounded-xl border border-bordure bg-surface p-4 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[13px] font-bold">Espace de stockage</h2>
          <span className="font-mono text-[12px] tabular-nums text-texte-doux">
            {formaterTaille(octetsUtilises)} sur {formaterTaille(QUOTA_STOCKAGE_OCTETS)}
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-creuse" role="meter" aria-valuenow={Math.round(pourcentage)} aria-valuemin={0} aria-valuemax={100} aria-label="Espace de stockage utilisé">
          <div className={`h-full rounded-full ${tonJauge}`} style={{ width: `${Math.max(pourcentage, octetsUtilises > 0 ? 1 : 0)}%` }} />
        </div>
        {pourcentage >= 70 && (
          <p className="mt-2 text-[11.5px] text-alerte">
            L&apos;espace gratuit se remplit. Au-delà, il faudra passer à l&apos;offre payante de Supabase.
          </p>
        )}
      </section>

      <form className="mb-4 flex flex-wrap items-center gap-2">
        <input type="search" name="q" defaultValue={recherche} placeholder="Nom du document…" className="w-full max-w-xs rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent-pale" />
        <select name="type" defaultValue={params.type ?? ""} className="rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent">
          <option value="">Tous les types</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>{t.nom}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-[12.5px] text-texte-doux">
          <input type="checkbox" name="archives" value="1" defaultChecked={avecArchives} />
          Inclure les archives
        </label>
        <button type="submit" className="rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] font-semibold">Filtrer</button>
      </form>

      <section className="overflow-hidden rounded-xl border border-bordure bg-surface shadow-sm">
        {documents.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-texte-doux">
            {recherche || params.type ? "Aucun document ne correspond à ces critères." : "La bibliothèque est vide."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12.8px]">
              <thead>
                <tr className="bg-surface-creuse text-left text-[10.8px] uppercase tracking-wider text-texte-tenu">
                  <th className="px-4 py-2.5 font-semibold">Document</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Rattaché à</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Version</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Mis à jour</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Statut</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((d) => {
                  const rattachement = d.formation?.titre ?? "";
                  const version = d.versions[0];
                  return (
                    <tr key={d.id} className="border-t border-bordure-douce hover:bg-surface-creuse">
                      <td className="px-4 py-2.5">
                        <Link href={`/documents/${d.id}`} className="font-semibold hover:text-accent-fort">{d.nom}</Link>
                        <div className="text-[11.5px] text-texte-tenu">{d.type?.nom ?? "Type non précisé"}</div>
                      </td>
                      <td className="max-w-[260px] truncate px-4 py-2.5 text-texte-doux">{rattachement || "—"}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 font-mono tabular-nums text-texte-doux">
                        {version ? `v${version.numero} · ${formaterTaille(version.taille)}` : "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 font-mono tabular-nums text-texte-doux">{dateCourte.format(d.updatedAt)}</td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <span className={`inline-block rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${TON_STATUT_DOCUMENT[d.statut]}`}>
                          {LIBELLE_STATUT_DOCUMENT[d.statut]}
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
