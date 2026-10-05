import Link from "next/link";

import { FormulaireSession } from "@/app/(app)/sessions/formulaire";
import { prisma } from "@/lib/prisma";
import { financeursConnus } from "@/lib/financeurs-connus";
import { optionsFormateurs } from "@/lib/formateurs";
import { exigerRole } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function PageNouvelleSession({
  searchParams,
}: {
  searchParams: Promise<{ formation?: string; entreprise?: string; formateur?: string; apprenant?: string }>;
}) {
  await exigerRole("ADMIN", "GESTIONNAIRE");
  const { formation, entreprise, formateur, apprenant: apprenantId } = await searchParams;

  const [formations, entreprises, formateurs] = await Promise.all([
    prisma.formation.findMany({
      where: { deletedAt: null, statut: "ACTIVE" },
      orderBy: { titre: "asc" },
      select: { id: true, titre: true, reference: true, modalite: true, prixHT: true, dureeHeures: true },
    }),
    prisma.company.findMany({
      where: { deletedAt: null },
      orderBy: { raisonSociale: "asc" },
      select: { id: true, raisonSociale: true, adresse: true, codePostal: true, ville: true },
    }),
    optionsFormateurs(),
  ]);

  // Session créée pour un stagiaire : il y sera inscrit dans la foulée.
  const apprenant = apprenantId
    ? await prisma.learner.findFirst({
        where: { id: apprenantId, deletedAt: null },
        select: { id: true, prenom: true, nom: true, financement: true, companyId: true },
      })
    : null;
  const financeurs = apprenant ? await financeursConnus() : [];

  // Pré-remplissage quand on arrive depuis une fiche formation ou entreprise.
  const choisie = formations.find((f) => f.id === formation);
  const valeursDeDepart: Record<string, string> = {};
  if (choisie) {
    valeursDeDepart.formationId = choisie.id;
    valeursDeDepart.modalite = choisie.modalite;
  }
  if (apprenant?.companyId && entreprises.some((e) => e.id === apprenant.companyId)) {
    valeursDeDepart.companyId = apprenant.companyId;
  }
  if (entreprises.some((e) => e.id === entreprise)) {
    valeursDeDepart.companyId = entreprise as string;
  }
  if (formateurs.some((f) => f.id === formateur)) {
    valeursDeDepart.trainerId = formateur as string;
  }

  return (
    <>
      <header className="mb-6">
        <Link href="/sessions" className="text-[12.5px] font-semibold text-accent-fort hover:underline">
          ← Sessions
        </Link>
        <h1 className="mt-2 text-[22px] font-extrabold tracking-tight">
          {apprenant ? `Nouvelle session pour ${apprenant.prenom} ${apprenant.nom}` : "Nouvelle session"}
        </h1>
      </header>

      <FormulaireSession
        formations={formations.map((f) => ({ ...f, prixHT: f.prixHT === null ? null : String(f.prixHT), dureeHeures: f.dureeHeures === null ? null : Number(f.dureeHeures) }))}
        entreprises={entreprises}
        formateurs={formateurs}
        valeursDeDepart={valeursDeDepart}
        apprenant={apprenant ? { ...apprenant, financeursConnus: financeurs } : undefined}
      />
    </>
  );
}
