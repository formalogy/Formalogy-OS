import Link from "next/link";
import { notFound } from "next/navigation";

import { ListeSessions } from "@/app/(app)/_composants/liste-sessions";
import { formaterEuros } from "@/lib/crm-libelles";
import {
  formaterDuree,
  LIBELLE_MODALITE,
  LIBELLE_STATUT_FORMATION,
  TON_STATUT_FORMATION,
} from "@/lib/formations-libelles";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";

export const dynamic = "force-dynamic";

function Bloc({ titre, texte }: { titre: string; texte: string | null }) {
  return (
    <div className="border-t border-bordure-douce py-3 first:border-t-0 first:pt-0">
      <h3 className="text-[12px] font-semibold uppercase tracking-wider text-texte-tenu">
        {titre}
      </h3>
      <p className="mt-1.5 whitespace-pre-line text-[13px] leading-relaxed">
        {texte?.trim() ? texte : <span className="text-texte-tenu">Non renseigné</span>}
      </p>
    </div>
  );
}

export default async function PageFormation({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigerRole("ADMIN", "GESTIONNAIRE");

  const { id } = await params;
  const formation = await prisma.formation.findFirst({
    where: { id, deletedAt: null },
    include: {
      category: { select: { nom: true } },
      sessions: {
        where: { deletedAt: null },
        orderBy: { dateDebut: "desc" },
        include: { company: { select: { raisonSociale: true } } },
      },
    },
  });

  if (!formation) notFound();

  return (
    <>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/formations"
            className="text-[12.5px] font-semibold text-accent-fort hover:underline"
          >
            ← Formations
          </Link>
          <h1 className="mt-2 text-[22px] font-extrabold tracking-tight">{formation.titre}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-texte-tenu">
            <span className="font-mono">{formation.reference}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                TON_STATUT_FORMATION[formation.statut]
              }`}
            >
              {LIBELLE_STATUT_FORMATION[formation.statut]}
            </span>
          </p>
        </div>
        <Link
          href={`/formations/${formation.id}/modifier`}
          className="rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] font-semibold"
        >
          Modifier
        </Link>
      </header>

      <section className="mb-4 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Prix HT", formaterEuros(formation.prixHT)],
          ["Durée", formaterDuree(formation.dureeHeures, formation.dureeJours)],
          ["Modalité", LIBELLE_MODALITE[formation.modalite]],
          ["Catégorie", formation.category?.nom ?? "—"],
        ].map(([libelle, valeur]) => (
          <div key={libelle} className="rounded-xl border border-bordure bg-surface p-4 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-texte-tenu">
              {libelle}
            </div>
            <div className="mt-1.5 font-mono text-[17px] font-semibold tabular-nums">{valeur}</div>
          </div>
        ))}
      </section>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <section className="rounded-xl border border-bordure bg-surface p-5 shadow-sm">
          <Bloc titre="Description" texte={formation.description} />
          <Bloc titre="Objectifs" texte={formation.objectifs} />
          <Bloc titre="Programme" texte={formation.programme} />
          <Bloc titre="Compétences visées" texte={formation.competences} />
        </section>

        <div className="flex flex-col gap-4">
          <section className="rounded-xl border border-bordure bg-surface p-5 shadow-sm">
            <Bloc titre="Prérequis" texte={formation.prerequis} />
            <Bloc titre="Public visé" texte={formation.publicVise} />
            <Bloc titre="Certification" texte={formation.certification} />
          </section>

          <ListeSessions
            titre="Sessions"
            lienCreation={formation.statut === "ACTIVE" ? `/sessions/nouvelle?formation=${formation.id}` : undefined}
            messageVide={
              formation.statut === "ACTIVE"
                ? "Aucune session programmée pour cette formation."
                : "Passez la formation au statut « Active » pour pouvoir programmer une session."
            }
            sessions={formation.sessions.map((s) => ({
              id: s.id,
              numero: s.numero,
              dateDebut: s.dateDebut,
              dateFin: s.dateFin,
              statut: s.statut,
              titre: s.company?.raisonSociale ?? "Inter-entreprises",
              sousTitre: s.numero,
            }))}
          />

          <section className="rounded-xl border border-dashed border-bordure bg-surface/50 p-5">
            <h2 className="text-[14.5px] font-bold text-texte-doux">Formateur et documents</h2>
            <p className="mt-2 text-[12.5px] text-texte-tenu">
              Le formateur associé (Phase 10) et les documents pédagogiques (Phase 8)
              apparaîtront ici.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
