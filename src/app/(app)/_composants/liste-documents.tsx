import type { StatutDocument } from "@prisma/client";
import Link from "next/link";

import { LIBELLE_STATUT_DOCUMENT, TON_STATUT_DOCUMENT } from "@/lib/documents-libelles";

export type DocumentResume = {
  id: string;
  nom: string;
  statut: StatutDocument;
  type: { nom: string } | null;
  versions: { numero: number }[];
};

/// Sélection Prisma à utiliser pour alimenter ce composant.
export const SELECTION_DOCUMENT_RESUME = {
  where: { deletedAt: null },
  orderBy: { updatedAt: "desc" as const },
  select: {
    id: true,
    nom: true,
    statut: true,
    type: { select: { nom: true } },
    versions: { orderBy: { numero: "desc" as const }, take: 1, select: { numero: true } },
  },
};

type Props = {
  documents: DocumentResume[];
  /// Paramètres de pré-remplissage du dépôt, ex. « apprenant=… »
  lienAjout: string;
  /// Raccourcis vers des types précis (ex. « CV », « Programme »), affichés à
  /// côté du lien général. Le type demandé y est déjà présélectionné.
  raccourcis?: { libelle: string; type: string }[];
};

export function ListeDocuments({ documents, lienAjout, raccourcis }: Props) {
  return (
    <section className="rounded-xl border border-bordure bg-surface p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1.5">
        <h2 className="text-[14.5px] font-bold">
          Documents <span className="font-normal text-texte-tenu">({documents.length})</span>
        </h2>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {raccourcis?.map((r) => (
            <Link
              key={r.type}
              href={`/documents/nouveau?${lienAjout}&type=${r.type}`}
              className="text-[12.5px] font-semibold text-accent-fort hover:underline"
            >
              {r.libelle}
            </Link>
          ))}
          <Link href={`/documents/nouveau?${lienAjout}`} className="text-[12.5px] font-semibold text-accent-fort hover:underline">
            Ajouter un document
          </Link>
        </div>
      </div>

      {documents.length === 0 ? (
        <p className="text-[12.8px] text-texte-doux">Aucun document rattaché.</p>
      ) : (
        <ul>
          {documents.map((d) => (
            <li key={d.id} className="border-t border-bordure-douce first:border-t-0">
              <Link href={`/documents/${d.id}`} className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-surface-creuse">
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold">{d.nom}</div>
                  <div className="truncate text-[11.5px] text-texte-tenu">
                    {d.type?.nom ?? "Type non précisé"}
                    {d.versions[0] ? ` · v${d.versions[0].numero}` : ""}
                  </div>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${TON_STATUT_DOCUMENT[d.statut]}`}>
                  {LIBELLE_STATUT_DOCUMENT[d.statut]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
