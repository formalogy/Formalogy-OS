import Link from "next/link";
import { notFound } from "next/navigation";

import { FormulaireApprenant } from "@/app/(app)/apprenants/nouveau/formulaire";
import { jourVersSaisie } from "@/lib/sessions-libelles";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function PageModifierApprenant({ params }: { params: Promise<{ id: string }> }) {
  await exigerRole("ADMIN", "GESTIONNAIRE");
  const { id } = await params;

  const [apprenant, entreprises] = await Promise.all([
    prisma.learner.findFirst({ where: { id, deletedAt: null } }),
    prisma.company.findMany({
      where: { deletedAt: null },
      orderBy: { raisonSociale: "asc" },
      select: { id: true, raisonSociale: true },
    }),
  ]);
  if (!apprenant) notFound();

  const initiales = {
    id: apprenant.id,
    prenom: apprenant.prenom,
    nom: apprenant.nom,
    dateNaissance: apprenant.dateNaissance ? jourVersSaisie(apprenant.dateNaissance) : "",
    email: apprenant.email ?? "",
    telephone: apprenant.telephone ?? "",
    adresse: apprenant.adresse ?? "",
    codePostal: apprenant.codePostal ?? "",
    ville: apprenant.ville ?? "",
    niveauEtudes: apprenant.niveauEtudes ?? "",
    companyId: apprenant.companyId ?? "",
    financement: apprenant.financement,
    statut: apprenant.statut,
    numeroDossierCpf: apprenant.numeroDossierCpf ?? "",
    numeroOffreCpf: apprenant.numeroOffreCpf ?? "",
    notes: apprenant.notes ?? "",
  };

  return (
    <>
      <header className="mb-6">
        <Link href={`/apprenants/${apprenant.id}`} className="text-[12.5px] font-semibold text-accent-fort hover:underline">
          ← {apprenant.prenom} {apprenant.nom}
        </Link>
        <h1 className="mt-2 text-[22px] font-extrabold tracking-tight">Modifier l&apos;apprenant</h1>
      </header>

      <FormulaireApprenant entreprises={entreprises} initiales={initiales} />
    </>
  );
}
