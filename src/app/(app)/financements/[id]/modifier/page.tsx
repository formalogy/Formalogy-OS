import Link from "next/link";
import { notFound } from "next/navigation";

import { FormulaireDossier } from "@/app/(app)/financements/formulaire";
import { optionsFacture } from "@/lib/factures-options";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";
import { jourVersSaisie } from "@/lib/sessions-libelles";

export const dynamic = "force-dynamic";

export default async function PageModifierDossier({ params }: { params: Promise<{ id: string }> }) {
  await exigerRole("ADMIN", "GESTIONNAIRE");
  const { id } = await params;
  const d = await prisma.dossierFinancement.findUnique({ where: { id } });
  if (!d) notFound();

  const options = await optionsFacture();
  const initiales = {
    id: d.id,
    financeurType: d.financeurType,
    financeurNom: d.financeurNom,
    reference: d.reference ?? "",
    montantDemande: d.montantDemande?.toFixed(2).replace(".", ",") ?? "",
    dateLimite: d.dateLimite ? jourVersSaisie(d.dateLimite) : "",
    subrogation: d.subrogation ? "on" : "",
    sessionId: d.sessionId ?? "",
    companyId: d.companyId ?? "",
    learnerId: d.learnerId ?? "",
    notes: d.notes ?? "",
  };

  return (
    <>
      <header className="mb-6">
        <Link href={`/financements/${d.id}`} className="text-[12.5px] font-semibold text-accent-fort hover:underline">
          ← Dossier
        </Link>
        <h1 className="mt-2 text-[22px] font-extrabold tracking-tight">Modifier le dossier</h1>
      </header>
      <FormulaireDossier {...options} initiales={initiales} />
    </>
  );
}
