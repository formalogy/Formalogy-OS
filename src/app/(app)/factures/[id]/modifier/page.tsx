import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { FormulaireFacture } from "@/app/(app)/factures/formulaire";
import { optionsFacture } from "@/lib/factures-options";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function PageModifierFacture({ params }: { params: Promise<{ id: string }> }) {
  await exigerRole("ADMIN", "GESTIONNAIRE");
  const { id } = await params;
  const f = await prisma.facture.findUnique({ where: { id } });
  if (!f) notFound();
  if (f.statut !== "A_EMETTRE") redirect(`/factures/${id}`);

  const options = await optionsFacture();
  const initiales = {
    id: f.id,
    objet: f.objet,
    payeurType: f.payeurType,
    payeurNom: f.payeurNom,
    montantHT: f.montantHT.toFixed(2).replace(".", ","),
    tauxTva: String(Number(f.tauxTva)),
    sessionId: f.sessionId ?? "",
    companyId: f.companyId ?? "",
    learnerId: f.learnerId ?? "",
    notes: f.notes ?? "",
  };

  return (
    <>
      <header className="mb-6">
        <Link href={`/factures/${f.id}`} className="text-[12.5px] font-semibold text-accent-fort hover:underline">
          ← Facture
        </Link>
        <h1 className="mt-2 text-[22px] font-extrabold tracking-tight">Modifier la facture</h1>
      </header>
      <FormulaireFacture {...options} initiales={initiales} />
    </>
  );
}
