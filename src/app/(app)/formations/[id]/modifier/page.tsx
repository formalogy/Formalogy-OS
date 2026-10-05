import Link from "next/link";
import { notFound } from "next/navigation";

import { FormulaireFormation } from "@/app/(app)/formations/formulaire";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";

export const dynamic = "force-dynamic";

/// Convertit une valeur de base en texte de formulaire, au format français.
function texte(valeur: unknown): string {
  if (valeur === null || valeur === undefined) return "";
  return String(valeur).replace(".", ",");
}

export default async function PageModifierFormation({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigerRole("ADMIN", "GESTIONNAIRE");

  const { id } = await params;
  const [formation, categories, formateurs] = await Promise.all([
    prisma.formation.findFirst({ where: { id, deletedAt: null }, include: { formateurs: { select: { id: true } } } }),
    prisma.formationCategory.findMany({
      orderBy: { ordre: "asc" },
      select: { id: true, nom: true },
    }),
    prisma.trainer.findMany({ where: { deletedAt: null }, orderBy: [{ nom: "asc" }, { prenom: "asc" }], select: { id: true, prenom: true, nom: true, actif: true } }),
  ]);

  if (!formation) notFound();

  const initiales = {
    id: formation.id,
    titre: formation.titre,
    reference: formation.reference,
    categoryId: formation.categoryId ?? "",
    modalite: formation.modalite,
    statut: formation.statut,
    dureeHeures: texte(formation.dureeHeures),
    dureeJours: texte(formation.dureeJours),
    certification: formation.certification ?? "",
    description: formation.description ?? "",
    objectifs: formation.objectifs ?? "",
    programme: formation.programme ?? "",
    competences: formation.competences ?? "",
    prerequis: formation.prerequis ?? "",
    publicVise: formation.publicVise ?? "",
    typeCertification: formation.typeCertification && formation.typeCertification !== "AUCUNE" ? formation.typeCertification : "",
    niveauCertification: formation.niveauCertification ?? "",
    methodes: formation.methodes ?? "",
    evaluation: formation.evaluation ?? "",
    accessibilite: formation.accessibilite ?? "",
    horaires: formation.horaires ?? "",
    plateforme: formation.plateforme && formation.plateforme !== "FORMATEUR" ? formation.plateforme : "",
    dureeAccesMois: formation.dureeAccesMois?.toString() ?? "",
    formateurs: formation.formateurs.map((f) => f.id).join(","),
  };

  return (
    <>
      <header className="mb-6">
        <Link
          href={`/formations/${formation.id}`}
          className="text-[12.5px] font-semibold text-accent-fort hover:underline"
        >
          ← {formation.titre}
        </Link>
        <h1 className="mt-2 text-[22px] font-extrabold tracking-tight">Modifier la formation</h1>
      </header>

      <FormulaireFormation
        categories={categories}
        formateurs={formateurs
          .filter((f) => f.actif || formation.formateurs.some((x) => x.id === f.id))
          .map((f) => ({ id: f.id, libelle: `${f.nom} ${f.prenom}` }))} initiales={initiales} />
    </>
  );
}
