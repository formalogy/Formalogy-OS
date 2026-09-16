import Link from "next/link";
import { notFound } from "next/navigation";

import { ListeSessions } from "@/app/(app)/_composants/liste-sessions";
import { SelecteurStatutApprenant } from "@/app/(app)/apprenants/[id]/selecteur-statut";
import {
  LIBELLE_FINANCEMENT,
  TON_STATUT_APPRENANT,
} from "@/lib/apprenants-libelles";
import { formaterDate } from "@/lib/crm-libelles";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";

export const dynamic = "force-dynamic";

/// Jalons du parcours d'un apprenant (cahier des charges, section 10).
/// Chacun sera coché automatiquement par la phase qui le construit.
const PARCOURS = [
  { etape: "Création de la fiche", phase: null },
  { etape: "Inscription à une session", phase: null },
  { etape: "Documents générés", phase: 8 },
  { etape: "Convention signée", phase: 11 },
  { etape: "Émargements", phase: 11 },
  { etape: "Évaluation", phase: 12 },
  { etape: "Attestation", phase: 12 },
  { etape: "Facturation", phase: 13 },
];

function Ligne({ libelle, valeur }: { libelle: string; valeur?: string | null }) {
  return (
    <div className="flex gap-3 border-t border-bordure-douce py-2 first:border-t-0">
      <dt className="w-36 shrink-0 text-[12.5px] text-texte-tenu">{libelle}</dt>
      <dd className="text-[13px]">{valeur?.trim() ? valeur : "—"}</dd>
    </div>
  );
}

export default async function PageApprenant({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigerRole("ADMIN", "GESTIONNAIRE");

  const { id } = await params;

  const apprenant = await prisma.learner.findFirst({
    where: { id, deletedAt: null },
    include: {
      company: { select: { id: true, raisonSociale: true } },
      inscriptions: {
        where: { session: { deletedAt: null } },
        orderBy: { session: { dateDebut: "desc" } },
        include: { session: { include: { formation: { select: { titre: true } } } } },
      },
    },
  });

  if (!apprenant) notFound();

  return (
    <>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/apprenants"
            className="text-[12.5px] font-semibold text-accent-fort hover:underline"
          >
            ← Apprenants
          </Link>
          <h1 className="mt-2 text-[22px] font-extrabold tracking-tight">
            {apprenant.prenom} {apprenant.nom}
          </h1>
        </div>
        <SelecteurStatutApprenant
          id={apprenant.id}
          statut={apprenant.statut}
          classeTon={TON_STATUT_APPRENANT[apprenant.statut]}
        />
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-bordure bg-surface p-5 shadow-sm">
          <h2 className="mb-3 text-[14.5px] font-bold">Identité</h2>
          <dl>
            <Ligne
              libelle="Date de naissance"
              valeur={apprenant.dateNaissance ? formaterDate(apprenant.dateNaissance) : null}
            />
            <Ligne libelle="Email" valeur={apprenant.email} />
            <Ligne libelle="Téléphone" valeur={apprenant.telephone} />
            <Ligne
              libelle="Adresse"
              valeur={[
                apprenant.adresse,
                [apprenant.codePostal, apprenant.ville].filter(Boolean).join(" "),
              ]
                .filter(Boolean)
                .join(", ")}
            />
          </dl>

          <h2 className="mb-3 mt-6 text-[14.5px] font-bold">Administratif</h2>
          <dl>
            <Ligne
              libelle="Entreprise"
              valeur={apprenant.company?.raisonSociale ?? "Particulier"}
            />
            <Ligne
              libelle="Financement"
              valeur={LIBELLE_FINANCEMENT[apprenant.financement]}
            />
            <Ligne libelle="Notes" valeur={apprenant.notes} />
          </dl>

          {apprenant.company && (
            <Link
              href={`/entreprises/${apprenant.company.id}`}
              className="mt-4 inline-block text-[12.5px] font-semibold text-accent-fort hover:underline"
            >
              Voir la fiche entreprise →
            </Link>
          )}
        </section>

        <section className="rounded-xl border border-bordure bg-surface p-5 shadow-sm">
          <h2 className="mb-1 text-[14.5px] font-bold">Parcours</h2>
          <p className="mb-4 text-[12px] text-texte-tenu">
            Les étapes se cocheront automatiquement au fil des phases.
          </p>
          <ol>
            {PARCOURS.map((jalon, rang) => {
              // Chaque étape est vérifiée sur les données, jamais présumée.
              const fait =
                rang === 0 ||
                (jalon.etape === "Inscription à une session" && apprenant.inscriptions.length > 0);
              return (
                <li
                  key={jalon.etape}
                  className="flex items-center gap-3 border-t border-bordure-douce py-2 first:border-t-0"
                >
                  <span
                    aria-hidden="true"
                    className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                      fait
                        ? "bg-succes/12 text-succes"
                        : "bg-surface-creuse text-texte-tenu"
                    }`}
                  >
                    {fait ? "✓" : rang + 1}
                  </span>
                  <span
                    className={`text-[13px] ${fait ? "font-semibold" : "text-texte-tenu"}`}
                  >
                    {jalon.etape}
                  </span>
                  {jalon.phase && !fait && (
                    <span className="ml-auto rounded-full bg-bordure-douce px-1.5 py-px text-[10px] text-texte-tenu">
                      P{jalon.phase}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      </div>
      <div className="mt-4">
        <ListeSessions
          titre="Sessions suivies"
          messageVide="Cet apprenant n'est inscrit à aucune session. L'inscription se fait depuis la fiche d'une session."
          sessions={apprenant.inscriptions.map(({ session }) => ({
            id: session.id,
            numero: session.numero,
            dateDebut: session.dateDebut,
            dateFin: session.dateFin,
            statut: session.statut,
            titre: session.formation.titre,
            sousTitre: session.numero,
          }))}
        />
      </div>
    </>
  );
}
