import Link from "next/link";
import { notFound } from "next/navigation";

import { ActionsDocument } from "@/app/(app)/documents/[id]/actions-document";
import { FormulaireVersion } from "@/app/(app)/documents/[id]/formulaire-version";
import {
  FORMATS_ACCEPTES,
  formaterTaille,
  LIBELLE_CATEGORIE_DOCUMENT,
  TON_STATUT_DOCUMENT,
} from "@/lib/documents-libelles";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";
import { formaterPeriode } from "@/lib/sessions-libelles";

export const dynamic = "force-dynamic";

const horodatage = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Paris",
});

export default async function PageDocument({ params }: { params: Promise<{ id: string }> }) {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");
  const { id } = await params;

  const document = await prisma.document.findFirst({
    where: { id, deletedAt: null },
    include: {
      type: { select: { nom: true } },
      learner: { select: { id: true, prenom: true, nom: true } },
      company: { select: { id: true, raisonSociale: true } },
      session: { select: { id: true, numero: true, dateDebut: true, dateFin: true } },
      formation: { select: { id: true, titre: true } },
      createdBy: { select: { name: true } },
      versions: { orderBy: { numero: "desc" }, include: { createdBy: { select: { name: true } } } },
    },
  });
  if (!document) notFound();

  const courante = document.versions[0];
  const apercu = courante && FORMATS_ACCEPTES[courante.typeMime]?.apercu;
  const lienFichier = (versionId: string) => `/api/documents/versions/${versionId}`;

  const rattachements = [
    document.learner && { href: `/apprenants/${document.learner.id}`, libelle: `Apprenant : ${document.learner.prenom} ${document.learner.nom}` },
    document.company && { href: `/entreprises/${document.company.id}`, libelle: `Entreprise : ${document.company.raisonSociale}` },
    document.session && { href: `/sessions/${document.session.id}`, libelle: `Session : ${document.session.numero} (${formaterPeriode(document.session.dateDebut, document.session.dateFin)})` },
    document.formation && { href: `/formations/${document.formation.id}`, libelle: `Formation : ${document.formation.titre}` },
  ].filter((r): r is { href: string; libelle: string } => Boolean(r));

  return (
    <>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/documents" className="text-[12.5px] font-semibold text-accent-fort hover:underline">
            ← Documents
          </Link>
          <h1 className="mt-2 break-words text-[22px] font-extrabold tracking-tight">{document.nom}</h1>
          <p className="mt-1 text-[12.5px] text-texte-doux">
            {document.type?.nom ?? "Type non précisé"} · {LIBELLE_CATEGORIE_DOCUMENT[document.categorie]}
          </p>
        </div>
        <ActionsDocument
          id={document.id}
          statut={document.statut}
          classeTon={TON_STATUT_DOCUMENT[document.statut]}
          peutSupprimer={utilisateur.role === "ADMIN"}
        />
      </header>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <section className="overflow-hidden rounded-xl border border-bordure bg-surface shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-bordure-douce px-4 py-3">
            <h2 className="text-[14.5px] font-bold">
              Aperçu {courante && <span className="font-normal text-texte-tenu">— version {courante.numero}</span>}
            </h2>
            {courante && (
              <div className="flex gap-2">
                {apercu && (
                  <a href={lienFichier(courante.id)} target="_blank" rel="noopener" className="rounded-lg border border-bordure px-3 py-1.5 text-[12.5px] font-semibold">
                    Ouvrir
                  </a>
                )}
                <a href={`${lienFichier(courante.id)}?telecharger`} className="rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-white">
                  Télécharger
                </a>
              </div>
            )}
          </div>

          {!courante ? (
            <p className="px-4 py-8 text-[13px] text-texte-doux">Ce document n&apos;a aucun fichier.</p>
          ) : apercu && courante.typeMime === "application/pdf" ? (
            <iframe src={lienFichier(courante.id)} title={`Aperçu de ${document.nom}`} className="h-[70vh] w-full bg-surface-creuse" />
          ) : apercu ? (
            // eslint-disable-next-line @next/next/no-img-element -- fichier privé servi par notre route, hors optimiseur d'images
            <img src={lienFichier(courante.id)} alt={`Aperçu de ${document.nom}`} className="mx-auto max-h-[70vh] w-auto p-4" />
          ) : (
            <div className="px-4 py-10 text-center">
              <p className="text-[13px] font-semibold">{courante.nomFichier}</p>
              <p className="mt-1 text-[12px] text-texte-tenu">
                Ce format ne s&apos;affiche pas dans le navigateur. Téléchargez-le pour l&apos;ouvrir.
              </p>
            </div>
          )}
        </section>

        <div className="flex flex-col gap-4">
          <section className="rounded-xl border border-bordure bg-surface p-5 shadow-sm">
            <h2 className="mb-3 text-[14.5px] font-bold">Rattachement</h2>
            {rattachements.length === 0 ? (
              <p className="text-[12.8px] text-texte-doux">Document général, rattaché à aucune fiche.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {rattachements.map((r) => (
                  <li key={r.href}>
                    <Link href={r.href} className="text-[13px] hover:text-accent-fort">{r.libelle}</Link>
                  </li>
                ))}
              </ul>
            )}
            {document.description && (
              <p className="mt-4 whitespace-pre-line border-t border-bordure-douce pt-3 text-[12.8px] text-texte-doux">{document.description}</p>
            )}
            <p className="mt-4 border-t border-bordure-douce pt-3 text-[11.5px] text-texte-tenu">
              Déposé le {horodatage.format(document.createdAt)}
              {document.createdBy ? ` par ${document.createdBy.name}` : ""}
            </p>
          </section>

          <section className="rounded-xl border border-bordure bg-surface p-5 shadow-sm">
            <h2 className="mb-3 text-[14.5px] font-bold">
              Versions <span className="font-normal text-texte-tenu">({document.versions.length})</span>
            </h2>
            <ol className="mb-4">
              {document.versions.map((v, i) => (
                <li key={v.id} className="border-t border-bordure-douce py-2.5 first:border-t-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[13px] font-semibold">
                      v{v.numero}
                      {i === 0 && <span className="ml-2 rounded-full bg-accent-pale px-1.5 py-px text-[10.5px] text-accent-fort">actuelle</span>}
                    </span>
                    <a href={`${lienFichier(v.id)}?telecharger`} className="text-[12px] font-semibold text-accent-fort hover:underline">
                      Télécharger
                    </a>
                  </div>
                  <div className="truncate text-[11.5px] text-texte-tenu">
                    {v.nomFichier} · {formaterTaille(v.taille)}
                  </div>
                  <div className="text-[11.5px] text-texte-tenu">
                    {horodatage.format(v.createdAt)}
                    {v.createdBy ? ` · ${v.createdBy.name}` : ""}
                  </div>
                  {v.commentaire && <div className="mt-1 text-[12px] text-texte-doux">« {v.commentaire} »</div>}
                  <div className="mt-1 truncate font-mono text-[10px] text-texte-tenu" title="Empreinte SHA-256 : prouve que le fichier n'a pas été modifié">
                    SHA-256 {v.empreinte}
                  </div>
                </li>
              ))}
            </ol>
            <FormulaireVersion documentId={document.id} />
          </section>
        </div>
      </div>
    </>
  );
}
