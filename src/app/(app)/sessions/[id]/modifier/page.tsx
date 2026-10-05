import Link from "next/link";
import { notFound } from "next/navigation";

import { FormulaireSession } from "@/app/(app)/sessions/formulaire";
import { prisma } from "@/lib/prisma";
import { optionsFormateurs } from "@/lib/formateurs";
import { exigerRole } from "@/lib/session";
import { jourVersSaisie } from "@/lib/sessions-libelles";

export const dynamic = "force-dynamic";

export default async function PageModifierSession({ params }: { params: Promise<{ id: string }> }) {
  await exigerRole("ADMIN", "GESTIONNAIRE");
  const { id } = await params;

  const session = await prisma.trainingSession.findFirst({
    where: { id, deletedAt: null },
    include: { formation: { select: { id: true, titre: true, reference: true, modalite: true, dureeHeures: true } } },
  });
  if (!session) notFound();

  const [actives, entreprises, formateurs] = await Promise.all([
    prisma.formation.findMany({
      where: { deletedAt: null, statut: "ACTIVE" },
      orderBy: { titre: "asc" },
      select: { id: true, titre: true, reference: true, modalite: true, dureeHeures: true },
    }),
    prisma.company.findMany({
      where: { deletedAt: null },
      orderBy: { raisonSociale: "asc" },
      select: { id: true, raisonSociale: true, adresse: true, codePostal: true, ville: true },
    }),
    optionsFormateurs(session.trainerId),
  ]);

  // La formation actuelle reste proposée même si elle n'est plus active.
  const formations = actives.some((f) => f.id === session.formation.id)
    ? actives
    : [session.formation, ...actives];

  const initiales = {
    id: session.id,
    formationId: session.formationId,
    companyId: session.companyId ?? "",
    dateDebut: jourVersSaisie(session.dateDebut),
    dateFin: jourVersSaisie(session.dateFin),
    horaires: session.horaires ?? "",
    lieu: session.lieu ?? "",
    modalite: session.modalite,
    attribution: session.interne ? "FORMALOGY" : "FORMATEUR",
    plateforme: session.plateforme ?? "",
    statut: session.statut,
    trainerId: session.trainerId ?? "",
    programmeId: session.programmeId ?? "",
    placesMax: session.placesMax?.toString() ?? "",
    notes: session.notes ?? "",
  };

  return (
    <>
      <header className="mb-6">
        <Link href={`/sessions/${session.id}`} className="text-[12.5px] font-semibold text-accent-fort hover:underline">
          ← {session.numero}
        </Link>
        <h1 className="mt-2 text-[22px] font-extrabold tracking-tight">Modifier la session</h1>
      </header>

      <FormulaireSession formations={formations.map((f) => ({ ...f, dureeHeures: f.dureeHeures === null ? null : Number(f.dureeHeures) }))} entreprises={entreprises} formateurs={formateurs} initiales={initiales} />
    </>
  );
}
