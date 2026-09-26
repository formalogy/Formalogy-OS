import Link from "next/link";
import { notFound } from "next/navigation";

import { ListeDocuments, SELECTION_DOCUMENT_RESUME } from "@/app/(app)/_composants/liste-documents";
import { ListeSessions } from "@/app/(app)/_composants/liste-sessions";
import { FormulaireContact } from "@/app/(app)/entreprises/[id]/formulaire-contact";
import {
  LIBELLE_FINANCEMENT,
  LIBELLE_STATUT_APPRENANT,
} from "@/lib/apprenants-libelles";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";

export const dynamic = "force-dynamic";

function Ligne({ libelle, valeur }: { libelle: string; valeur?: string | null }) {
  return (
    <div className="flex gap-3 border-t border-bordure-douce py-2 first:border-t-0">
      <dt className="w-36 shrink-0 text-[12.5px] text-texte-tenu">{libelle}</dt>
      <dd className="text-[13px]">{valeur?.trim() ? valeur : "—"}</dd>
    </div>
  );
}

export default async function PageEntreprise({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigerRole("ADMIN", "GESTIONNAIRE");

  const { id } = await params;

  const entreprise = await prisma.company.findFirst({
    where: { id, deletedAt: null },
    include: {
      contacts: { where: { deletedAt: null }, orderBy: { nom: "asc" } },
      learners: { where: { deletedAt: null }, orderBy: { nom: "asc" } },
      sessions: {
        where: { deletedAt: null },
        orderBy: { dateDebut: "desc" },
        include: { formation: { select: { titre: true } }, _count: { select: { inscriptions: true } } },
      },
      createdBy: { select: { name: true } },
      documents: SELECTION_DOCUMENT_RESUME,
    },
  });

  if (!entreprise) notFound();

  return (
    <>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/entreprises"
            className="text-[12.5px] font-semibold text-accent-fort hover:underline"
          >
            ← Entreprises
          </Link>
          <h1 className="mt-2 text-[22px] font-extrabold tracking-tight">
            {entreprise.raisonSociale}
          </h1>
          {entreprise.createdBy && (
            <p className="mt-1 text-[12px] text-texte-tenu">
              Fiche créée par {entreprise.createdBy.name}
            </p>
          )}
        </div>
        <Link
          href={`/entreprises/${entreprise.id}/modifier`}
          className="rounded-lg border border-bordure bg-surface px-3 py-2 text-[12.5px] font-semibold text-accent-fort shadow-sm hover:bg-surface-creuse"
        >
          Modifier
        </Link>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-bordure bg-surface p-5 shadow-sm">
          <h2 className="mb-3 text-[14.5px] font-bold">Informations</h2>
          <dl>
            <Ligne libelle="SIRET" valeur={entreprise.siret} />
            <Ligne libelle="Code APE" valeur={entreprise.codeApe} />
            <Ligne
              libelle="Adresse"
              valeur={[entreprise.adresse, [entreprise.codePostal, entreprise.ville].filter(Boolean).join(" ")]
                .filter(Boolean)
                .join(", ")}
            />
            <Ligne libelle="Téléphone" valeur={entreprise.telephone} />
            <Ligne libelle="Email" valeur={entreprise.email} />
            <Ligne libelle="Site web" valeur={entreprise.siteWeb} />
            <Ligne libelle="Notes" valeur={entreprise.notes} />
          </dl>
        </section>

        <section className="rounded-xl border border-bordure bg-surface p-5 shadow-sm">
          <h2 className="mb-3 text-[14.5px] font-bold">
            Contacts{" "}
            <span className="font-normal text-texte-tenu">
              ({entreprise.contacts.length})
            </span>
          </h2>

          {entreprise.contacts.length === 0 ? (
            <p className="text-[12.8px] text-texte-doux">
              Aucun contact enregistré pour cette entreprise.
            </p>
          ) : (
            <ul className="mb-4">
              {entreprise.contacts.map((contact) => (
                <li
                  key={contact.id}
                  className="border-t border-bordure-douce py-2.5 first:border-t-0"
                >
                  <div className="text-[13px] font-semibold">
                    {contact.prenom} {contact.nom}
                  </div>
                  <div className="text-[11.5px] text-texte-tenu">
                    {[contact.fonction, contact.email, contact.telephone]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <FormulaireContact companyId={entreprise.id} />
        </section>
      </div>

      <section className="mt-4 rounded-xl border border-bordure bg-surface p-5 shadow-sm">
        <h2 className="mb-3 text-[14.5px] font-bold">
          Apprenants{" "}
          <span className="font-normal text-texte-tenu">
            ({entreprise.learners.length})
          </span>
        </h2>

        {entreprise.learners.length === 0 ? (
          <p className="text-[12.8px] text-texte-doux">
            Aucun apprenant rattaché à cette entreprise.{" "}
            <Link
              href="/apprenants/nouveau"
              className="font-semibold text-accent-fort hover:underline"
            >
              En ajouter un
            </Link>
          </p>
        ) : (
          <ul className="grid gap-x-6 sm:grid-cols-2">
            {entreprise.learners.map((apprenant) => (
              <li
                key={apprenant.id}
                className="border-t border-bordure-douce py-2 first:border-t-0 sm:[&:nth-child(2)]:border-t-0"
              >
                <Link
                  href={`/apprenants/${apprenant.id}`}
                  className="text-[13px] font-semibold hover:text-accent-fort"
                >
                  {apprenant.prenom} {apprenant.nom}
                </Link>
                <div className="text-[11.5px] text-texte-tenu">
                  {LIBELLE_STATUT_APPRENANT[apprenant.statut]} ·{" "}
                  {LIBELLE_FINANCEMENT[apprenant.financement]}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-4">
        <ListeSessions
          titre="Sessions"
          lienCreation={`/sessions/nouvelle?entreprise=${entreprise.id}`}
          messageVide="Aucune session programmée pour cette entreprise."
          sessions={entreprise.sessions.map((s) => ({
            id: s.id,
            numero: s.numero,
            dateDebut: s.dateDebut,
            dateFin: s.dateFin,
            statut: s.statut,
            titre: s.formation.titre,
            sousTitre: `${s.numero} · ${s._count.inscriptions} inscrit${s._count.inscriptions > 1 ? "s" : ""}`,
          }))}
        />
      </div>

      <div className="mt-4">
        <ListeDocuments documents={entreprise.documents} lienAjout={`entreprise=${entreprise.id}`} />
      </div>

      <section className="mt-4 rounded-xl border border-dashed border-bordure bg-surface/50 p-5">
        <h2 className="text-[14.5px] font-bold text-texte-doux">Factures</h2>
        <p className="mt-2 text-[12.5px] text-texte-tenu">
          Les factures (Phase 13) rattachées à l&apos;entreprise apparaîtront ici.
        </p>
      </section>
    </>
  );
}
