import Link from "next/link";
import { notFound } from "next/navigation";

import { FormulaireInscriptionApprenant } from "@/app/(app)/apprenants/[id]/inscrire-session/formulaire";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";
import { aujourdhuiUTC, formaterPeriode } from "@/lib/sessions-libelles";

export const dynamic = "force-dynamic";

export default async function PageInscrireSession({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ nouveau?: string }>;
}) {
  await exigerRole("ADMIN", "GESTIONNAIRE");
  const { id } = await params;
  // Cet écran sert à deux moments : juste après la création d'un apprenant,
  // et depuis sa fiche plus tard. Le texte d'accueil s'adapte.
  const vientDEtreCree = (await searchParams).nouveau !== undefined;

  const apprenant = await prisma.learner.findFirst({ where: { id, deletedAt: null } });
  if (!apprenant) notFound();

  const sessions = await prisma.trainingSession.findMany({
    where: {
      deletedAt: null,
      statut: { notIn: ["ANNULEE", "CLOTUREE"] },
      dateFin: { gte: aujourdhuiUTC() },
    },
    orderBy: { dateDebut: "asc" },
    include: {
      formation: { select: { titre: true } },
      _count: { select: { inscriptions: true } },
    },
  });

  const disponibles = sessions.filter((s) => s.placesMax === null || s._count.inscriptions < s.placesMax);
  const candidats = disponibles.map((s) => ({
    id: s.id,
    libelle: `${s.formation.titre} — ${formaterPeriode(s.dateDebut, s.dateFin)} (${s.numero})`,
  }));

  return (
    <>
      <header className="mb-6">
        <Link href={`/apprenants/${apprenant.id}`} className="text-[12.5px] font-semibold text-accent-fort hover:underline">
          ← {apprenant.prenom} {apprenant.nom}
        </Link>
        <h1 className="mt-2 text-[22px] font-extrabold tracking-tight">Inscrire à une session</h1>
        <p className="mt-1 text-[12.8px] text-texte-doux">
          {vientDEtreCree ? (
            <>
              {apprenant.prenom} {apprenant.nom} a été créé{apprenant.email ? "" : " sans adresse email"}. Choisissez une
              session en cours ou à venir, ou passez cette étape.
            </>
          ) : (
            <>
              Choisissez une session en cours ou à venir pour y inscrire {apprenant.prenom} {apprenant.nom}.
              {!apprenant.email && " Cet apprenant n'a pas d'adresse email : il ne recevra aucun envoi automatique."}
            </>
          )}
        </p>
      </header>

      <section className="max-w-xl rounded-xl border border-bordure bg-surface p-5 shadow-sm">
        <FormulaireInscriptionApprenant learnerId={apprenant.id} candidats={candidats} />
      </section>

      <p className="mt-4 text-[12.5px]">
        <Link href={`/apprenants/${apprenant.id}`} className="font-semibold text-texte-doux hover:text-accent-fort">
          Plus tard — revenir à la fiche
        </Link>
      </p>
    </>
  );
}
