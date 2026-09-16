import Link from "next/link";

import { FormulaireDocument } from "@/app/(app)/documents/formulaire";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";
import { formaterPeriode } from "@/lib/sessions-libelles";
import { stockageConfigure } from "@/lib/stockage";

export const dynamic = "force-dynamic";

export default async function PageNouveauDocument({
  searchParams,
}: {
  searchParams: Promise<{ apprenant?: string; entreprise?: string; session?: string; formation?: string; type?: string }>;
}) {
  await exigerRole("ADMIN", "GESTIONNAIRE");
  const params = await searchParams;

  const [types, apprenants, entreprises, sessions, formations] = await Promise.all([
    prisma.documentType.findMany({ orderBy: { ordre: "asc" } }),
    prisma.learner.findMany({ where: { deletedAt: null }, orderBy: [{ nom: "asc" }, { prenom: "asc" }], select: { id: true, nom: true, prenom: true } }),
    prisma.company.findMany({ where: { deletedAt: null }, orderBy: { raisonSociale: "asc" }, select: { id: true, raisonSociale: true } }),
    prisma.trainingSession.findMany({
      where: { deletedAt: null },
      orderBy: { dateDebut: "desc" },
      take: 200,
      select: { id: true, numero: true, dateDebut: true, dateFin: true, formation: { select: { titre: true } } },
    }),
    prisma.formation.findMany({ where: { deletedAt: null }, orderBy: { titre: "asc" }, select: { id: true, titre: true } }),
  ]);

  // Pré-remplissage depuis une fiche : rattachement, type et catégorie déduits.
  const depart: Record<string, string> = {};
  const type = types.find((t) => t.code === params.type);
  if (type) {
    depart.typeId = type.id;
    depart.categorie = type.categorie;
  }
  if (apprenants.some((a) => a.id === params.apprenant)) {
    depart.learnerId = params.apprenant!;
    depart.categorie ??= "APPRENANT";
  }
  if (entreprises.some((e) => e.id === params.entreprise)) {
    depart.companyId = params.entreprise!;
    depart.categorie ??= "ENTREPRISE";
  }
  if (sessions.some((s) => s.id === params.session)) {
    depart.sessionId = params.session!;
    depart.categorie ??= "SESSION";
  }
  if (formations.some((f) => f.id === params.formation)) {
    depart.formationId = params.formation!;
    depart.categorie ??= "FORMATION";
  }

  return (
    <>
      <header className="mb-6">
        <Link href="/documents" className="text-[12.5px] font-semibold text-accent-fort hover:underline">
          ← Documents
        </Link>
        <h1 className="mt-2 text-[22px] font-extrabold tracking-tight">Déposer un document</h1>
      </header>

      <FormulaireDocument
        stockagePret={stockageConfigure()}
        valeursDeDepart={depart}
        types={types.map((t) => ({ id: t.id, libelle: t.nom, categorie: t.categorie }))}
        apprenants={apprenants.map((a) => ({ id: a.id, libelle: `${a.nom} ${a.prenom}` }))}
        entreprises={entreprises.map((e) => ({ id: e.id, libelle: e.raisonSociale }))}
        sessions={sessions.map((s) => ({ id: s.id, libelle: `${s.numero} — ${s.formation.titre} (${formaterPeriode(s.dateDebut, s.dateFin)})` }))}
        formations={formations.map((f) => ({ id: f.id, libelle: f.titre }))}
      />
    </>
  );
}
