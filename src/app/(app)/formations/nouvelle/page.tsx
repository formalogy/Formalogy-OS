import Link from "next/link";

import { FormulaireFormation } from "@/app/(app)/formations/formulaire";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function PageNouvelleFormation() {
  await exigerRole("ADMIN", "GESTIONNAIRE");

  const [categories, formateurs] = await Promise.all([
    prisma.formationCategory.findMany({ orderBy: { ordre: "asc" }, select: { id: true, nom: true } }),
    prisma.trainer.findMany({ where: { deletedAt: null, actif: true }, orderBy: [{ nom: "asc" }, { prenom: "asc" }], select: { id: true, prenom: true, nom: true } }),
  ]);

  return (
    <>
      <header className="mb-6">
        <Link
          href="/formations"
          className="text-[12.5px] font-semibold text-accent-fort hover:underline"
        >
          ← Formations
        </Link>
        <h1 className="mt-2 text-[22px] font-extrabold tracking-tight">Nouvelle formation</h1>
      </header>

      <FormulaireFormation categories={categories} formateurs={formateurs.map((f) => ({ id: f.id, libelle: `${f.nom} ${f.prenom}` }))} />
    </>
  );
}
