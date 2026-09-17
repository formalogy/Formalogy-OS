import Link from "next/link";
import { notFound } from "next/navigation";

import { FormulaireFormateur } from "@/app/(app)/formateurs/formulaire";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function PageModifierFormateur({ params }: { params: Promise<{ id: string }> }) {
  await exigerRole("ADMIN", "GESTIONNAIRE");
  const { id } = await params;

  const f = await prisma.trainer.findFirst({ where: { id, deletedAt: null } });
  if (!f) notFound();

  const initiales = {
    id: f.id,
    prenom: f.prenom,
    nom: f.nom,
    email: f.email ?? "",
    telephone: f.telephone ?? "",
    statut: f.statut,
    siret: f.siret ?? "",
    specialites: f.specialites ?? "",
    tarifJournalierHT: f.tarifJournalierHT?.toFixed(2).replace(".", ",").replace(",00", "") ?? "",
    notes: f.notes ?? "",
  };

  return (
    <>
      <header className="mb-6">
        <Link href={`/formateurs/${f.id}`} className="text-[12.5px] font-semibold text-accent-fort hover:underline">
          ← {f.prenom} {f.nom}
        </Link>
        <h1 className="mt-2 text-[22px] font-extrabold tracking-tight">Modifier le formateur</h1>
      </header>

      <FormulaireFormateur initiales={initiales} emailVerrouille={Boolean(f.userId)} />
    </>
  );
}
