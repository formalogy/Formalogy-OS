import Link from "next/link";

import { FormulaireFacture } from "@/app/(app)/factures/formulaire";
import { optionsFacture } from "@/lib/factures-options";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function PageNouvelleFacture({ searchParams }: { searchParams: Promise<{ session?: string }> }) {
  await exigerRole("ADMIN", "GESTIONNAIRE");
  const { session: sessionId } = await searchParams;
  const options = await optionsFacture();

  // Pré-remplissage depuis une session : objet, client et prix de la session.
  const depart: Record<string, string> = { payeurType: "ENTREPRISE", tauxTva: "0" };
  if (sessionId) {
    const s = await prisma.trainingSession.findFirst({
      where: { id: sessionId, deletedAt: null },
      include: { formation: { select: { titre: true } }, company: { select: { id: true, raisonSociale: true } } },
    });
    if (s) {
      depart.sessionId = s.id;
      depart.objet = `${s.formation.titre} — session ${s.numero}`;
      if (s.prixHT) depart.montantHT = s.prixHT.toFixed(2).replace(".", ",");
      if (s.company) {
        depart.companyId = s.company.id;
        depart.payeurNom = s.company.raisonSociale;
      }
    }
  }

  return (
    <>
      <header className="mb-6">
        <Link href="/factures" className="text-[12.5px] font-semibold text-accent-fort hover:underline">
          ← Factures
        </Link>
        <h1 className="mt-2 text-[22px] font-extrabold tracking-tight">Préparer une facture</h1>
        <p className="mt-1 text-[12.8px] text-texte-doux">
          La facture est ensuite émise dans Henrri, qui lui attribue son numéro officiel.
        </p>
      </header>
      <FormulaireFacture {...options} initiales={depart} />
    </>
  );
}
