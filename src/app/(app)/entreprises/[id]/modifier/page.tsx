import Link from "next/link";
import { notFound } from "next/navigation";

import { FormulaireEntreprise } from "@/app/(app)/entreprises/nouvelle/formulaire";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";

export default async function PageModifierEntreprise({ params }: { params: Promise<{ id: string }> }) {
  await exigerRole("ADMIN", "GESTIONNAIRE");
  const { id } = await params;
  const entreprise = await prisma.company.findFirst({ where: { id, deletedAt: null } });
  if (!entreprise) notFound();

  return (
    <>
      <header className="mb-6">
        <Link href={`/entreprises/${entreprise.id}`} className="text-[12.5px] font-semibold text-accent-fort hover:underline">
          ← {entreprise.raisonSociale}
        </Link>
        <h1 className="mt-2 text-[22px] font-extrabold tracking-tight">Modifier l&apos;entreprise</h1>
      </header>

      <FormulaireEntreprise
        entreprise={{
          id: entreprise.id,
          raisonSociale: entreprise.raisonSociale,
          siret: entreprise.siret ?? "",
          codeApe: entreprise.codeApe ?? "",
          adresse: entreprise.adresse ?? "",
          codePostal: entreprise.codePostal ?? "",
          ville: entreprise.ville ?? "",
          telephone: entreprise.telephone ?? "",
          email: entreprise.email ?? "",
          siteWeb: entreprise.siteWeb ?? "",
          notes: entreprise.notes ?? "",
        }}
      />
    </>
  );
}
