import Link from "next/link";
import { redirect } from "next/navigation";

import { CatalogueSessions } from "@/app/(app)/sessions/nouvelle/catalogue";
import { formaterDuree, LIBELLE_MODALITE } from "@/lib/formations-libelles";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";

export const dynamic = "force-dynamic";

/// « Créer une session » (client, 05/10/2026) : on choisit d'abord la
/// formation dans le catalogue ; la session naît pré-remplie.
export default async function PageNouvelleSession({
  searchParams,
}: {
  searchParams: Promise<{ formation?: string; entreprise?: string; formateur?: string; apprenant?: string; erreur?: string }>;
}) {
  await exigerRole("ADMIN", "GESTIONNAIRE");
  const p = await searchParams;
  // Session pour un stagiaire précis : le formulaire détaillé gère son inscription.
  if (p.apprenant) redirect(`/sessions/nouvelle/detaillee?apprenant=${encodeURIComponent(p.apprenant)}`);

  const formations = await prisma.formation.findMany({
    where: { deletedAt: null, statut: "ACTIVE" },
    orderBy: { titre: "asc" },
    select: {
      id: true,
      titre: true,
      reference: true,
      modalite: true,
      dureeHeures: true,
      dureeJours: true,
      typeCertification: true,
      category: { select: { nom: true } },
      formateurs: { where: { deletedAt: null, actif: true }, select: { prenom: true, nom: true } },
    },
  });
  const brouillons = await prisma.formation.count({ where: { deletedAt: null, statut: "BROUILLON" } });
  const choisie = formations.find((f) => f.id === p.formation);

  return (
    <>
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/sessions" className="text-[12.5px] font-semibold text-accent-fort hover:underline">
            ← Sessions
          </Link>
          <h1 className="mt-2 text-[22px] font-extrabold tracking-tight">Créer une session</h1>
          <p className="mt-1 text-[12.8px] text-texte-doux">
            Choisissez la formation : la session reprend tout ce que le catalogue en sait. Vous compléterez ensuite les
            séances, le formateur et les participants.
          </p>
        </div>
        <Link href="/sessions/nouvelle/detaillee" className="text-[12.5px] font-semibold text-texte-doux underline">
          Formulaire détaillé
        </Link>
      </header>

      {p.erreur && <p className="mb-4 max-w-3xl rounded-lg bg-danger-pale px-3 py-2 text-[12.5px] text-danger">{p.erreur}</p>}

      <CatalogueSessions
        rechercheInitiale={choisie?.titre ?? ""}
        formateur={p.formateur ?? ""}
        entreprise={p.entreprise ?? ""}
        formations={formations.map((f) => ({
          id: f.id,
          titre: f.titre,
          reference: f.reference,
          categorie: f.category?.nom ?? null,
          modalite: LIBELLE_MODALITE[f.modalite],
          duree: formaterDuree(f.dureeHeures, f.dureeJours),
          certification: f.typeCertification === "RS" ? "RS" : f.typeCertification === "RNCP" ? "RNCP" : null,
          formateurs: f.formateurs.map((t) => `${t.prenom} ${t.nom}`),
        }))}
      />

      {brouillons > 0 && (
        <p className="mt-4 text-[12px] text-texte-tenu">
          {brouillons} formation{brouillons > 1 ? "s" : ""} en brouillon n&apos;apparai{brouillons > 1 ? "ssent" : "t"} pas : passez-les en
          « Active » dans le <Link href="/formations" className="underline">catalogue</Link>.
        </p>
      )}
    </>
  );
}
