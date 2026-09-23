import Link from "next/link";

import { FormulaireDossier } from "@/app/(app)/financements/formulaire";
import { optionsFacture } from "@/lib/factures-options";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function PageNouveauDossier({ searchParams }: { searchParams: Promise<{ session?: string; apprenant?: string }> }) {
  await exigerRole("ADMIN", "GESTIONNAIRE");
  const params = await searchParams;
  const options = await optionsFacture();

  // Pré-remplissage depuis une session : client et montant de référence.
  const depart: Record<string, string> = { financeurType: "OPCO", subrogation: "on" };
  if (params.session) {
    const s = await prisma.trainingSession.findFirst({
      where: { id: params.session, deletedAt: null },
      include: { company: { select: { id: true, raisonSociale: true } } },
    });
    if (s) {
      depart.sessionId = s.id;
      if (s.prixHT) depart.montant = s.prixHT.toFixed(2).replace(".", ",");
      if (s.company) depart.companyId = s.company.id;
    }
  }
  if (params.apprenant && options.apprenants.some((a) => a.id === params.apprenant)) {
    depart.learnerId = params.apprenant;
  }

  return (
    <>
      <header className="mb-6">
        <Link href="/financements" className="text-[12.5px] font-semibold text-accent-fort hover:underline">
          ← Prises en charge
        </Link>
        <h1 className="mt-2 text-[22px] font-extrabold tracking-tight">Nouveau dossier de financement</h1>
        <p className="mt-1 text-[12.8px] text-texte-doux">
          Le dossier se dépose sur le portail du financeur ; son suivi se fait ici.
        </p>
      </header>
      <FormulaireDossier {...options} initiales={depart} />
    </>
  );
}
