import Link from "next/link";

import { FormulaireSession } from "@/app/(app)/sessions/formulaire";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function PageNouvelleSession({
  searchParams,
}: {
  searchParams: Promise<{ formation?: string; entreprise?: string }>;
}) {
  await exigerRole("ADMIN", "GESTIONNAIRE");
  const { formation, entreprise } = await searchParams;

  const [formations, entreprises] = await Promise.all([
    prisma.formation.findMany({
      where: { deletedAt: null, statut: "ACTIVE" },
      orderBy: { titre: "asc" },
      select: { id: true, titre: true, reference: true, modalite: true },
    }),
    prisma.company.findMany({
      where: { deletedAt: null },
      orderBy: { raisonSociale: "asc" },
      select: { id: true, raisonSociale: true },
    }),
  ]);

  // Pré-remplissage quand on arrive depuis une fiche formation ou entreprise.
  const choisie = formations.find((f) => f.id === formation);
  const valeursDeDepart: Record<string, string> = {};
  if (choisie) {
    valeursDeDepart.formationId = choisie.id;
    valeursDeDepart.modalite = choisie.modalite;
  }
  if (entreprises.some((e) => e.id === entreprise)) {
    valeursDeDepart.companyId = entreprise as string;
  }

  return (
    <>
      <header className="mb-6">
        <Link href="/sessions" className="text-[12.5px] font-semibold text-accent-fort hover:underline">
          ← Sessions
        </Link>
        <h1 className="mt-2 text-[22px] font-extrabold tracking-tight">Nouvelle session</h1>
      </header>

      <FormulaireSession
        formations={formations}
        entreprises={entreprises}
        valeursDeDepart={valeursDeDepart}
      />
    </>
  );
}
