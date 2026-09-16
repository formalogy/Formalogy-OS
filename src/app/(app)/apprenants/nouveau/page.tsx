import Link from "next/link";

import { FormulaireApprenant } from "@/app/(app)/apprenants/nouveau/formulaire";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function PageNouvelApprenant() {
  await exigerRole("ADMIN", "GESTIONNAIRE");

  const entreprises = await prisma.company.findMany({
    where: { deletedAt: null },
    orderBy: { raisonSociale: "asc" },
    select: { id: true, raisonSociale: true },
  });

  return (
    <>
      <header className="mb-6">
        <Link
          href="/apprenants"
          className="text-[12.5px] font-semibold text-accent-fort hover:underline"
        >
          ← Apprenants
        </Link>
        <h1 className="mt-2 text-[22px] font-extrabold tracking-tight">Nouvel apprenant</h1>
      </header>

      <FormulaireApprenant entreprises={entreprises} />
    </>
  );
}
