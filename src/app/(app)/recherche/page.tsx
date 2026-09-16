import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";
import { formaterPeriode } from "@/lib/sessions-libelles";

export const dynamic = "force-dynamic";

const LIMITE = 8;

type Resultat = { href: string; titre: string; detail: string };

function Groupe({ titre, resultats, voirTout }: { titre: string; resultats: Resultat[]; voirTout?: string }) {
  if (resultats.length === 0) return null;
  return (
    <section className="overflow-hidden rounded-xl border border-bordure bg-surface shadow-sm">
      <div className="flex items-center justify-between border-b border-bordure-douce px-4 py-2.5">
        <h2 className="text-[13px] font-bold">{titre}</h2>
        {voirTout && resultats.length >= LIMITE && (
          <Link href={voirTout} className="text-[12px] font-semibold text-accent-fort hover:underline">
            Voir tout
          </Link>
        )}
      </div>
      <ul>
        {resultats.map((r, i) => (
          <li key={`${r.href}-${i}`} className="border-t border-bordure-douce first:border-t-0">
            <Link href={r.href} className="block px-4 py-2.5 hover:bg-surface-creuse">
              <div className="text-[13px] font-semibold">{r.titre}</div>
              <div className="text-[11.5px] text-texte-tenu">{r.detail}</div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function PageRecherche({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await exigerRole("ADMIN", "GESTIONNAIRE");

  const { q } = await searchParams;
  const terme = q?.trim() ?? "";
  const contient = { contains: terme, mode: "insensitive" as const };

  if (terme.length < 2) {
    return (
      <>
        <h1 className="mb-2 text-[22px] font-extrabold tracking-tight">Recherche</h1>
        <p className="text-[13px] text-texte-doux">
          Saisissez au moins deux caractères dans la barre de recherche, en haut de la page.
        </p>
      </>
    );
  }

  const [apprenants, entreprises, contacts, prospects, formations, sessions] = await Promise.all([
    prisma.learner.findMany({
      where: { deletedAt: null, OR: [{ nom: contient }, { prenom: contient }, { email: contient }] },
      take: LIMITE,
      orderBy: { nom: "asc" },
      include: { company: { select: { raisonSociale: true } } },
    }),
    prisma.company.findMany({
      where: { deletedAt: null, OR: [{ raisonSociale: contient }, { ville: contient }, { siret: { contains: terme.replace(/\s/g, "") } }] },
      take: LIMITE,
      orderBy: { raisonSociale: "asc" },
    }),
    prisma.contact.findMany({
      where: { deletedAt: null, OR: [{ nom: contient }, { prenom: contient }, { email: contient }] },
      take: LIMITE,
      orderBy: { nom: "asc" },
      include: { company: { select: { id: true, raisonSociale: true } } },
    }),
    prisma.prospect.findMany({
      where: { deletedAt: null, OR: [{ nom: contient }, { prenom: contient }, { email: contient }, { entreprise: contient }] },
      take: LIMITE,
      orderBy: { nom: "asc" },
    }),
    prisma.formation.findMany({
      where: { deletedAt: null, OR: [{ titre: contient }, { reference: contient }] },
      take: LIMITE,
      orderBy: { titre: "asc" },
    }),
    prisma.trainingSession.findMany({
      where: {
        deletedAt: null,
        OR: [{ numero: contient }, { formation: { titre: contient } }, { company: { raisonSociale: contient } }, { intervenant: contient }],
      },
      take: LIMITE,
      orderBy: { dateDebut: "desc" },
      include: { formation: { select: { titre: true } }, company: { select: { raisonSociale: true } } },
    }),
  ]);

  const total = apprenants.length + entreprises.length + contacts.length + prospects.length + formations.length + sessions.length;

  return (
    <>
      <header className="mb-5">
        <h1 className="text-[22px] font-extrabold tracking-tight">Recherche</h1>
        <p className="mt-1 text-[12.8px] text-texte-doux">
          {total === 0 ? `Aucun résultat pour « ${terme} ».` : `Résultats pour « ${terme} »`}
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <Groupe
          titre="Apprenants"
          voirTout={`/apprenants?q=${encodeURIComponent(terme)}`}
          resultats={apprenants.map((a) => ({
            href: `/apprenants/${a.id}`,
            titre: `${a.prenom} ${a.nom}`,
            detail: [a.company?.raisonSociale, a.email].filter(Boolean).join(" · ") || "—",
          }))}
        />
        <Groupe
          titre="Entreprises"
          voirTout={`/entreprises?q=${encodeURIComponent(terme)}`}
          resultats={entreprises.map((e) => ({
            href: `/entreprises/${e.id}`,
            titre: e.raisonSociale,
            detail: [e.ville, e.siret].filter(Boolean).join(" · ") || "—",
          }))}
        />
        <Groupe
          titre="Sessions"
          voirTout={`/sessions?periode=toutes&q=${encodeURIComponent(terme)}`}
          resultats={sessions.map((s) => ({
            href: `/sessions/${s.id}`,
            titre: s.formation.titre,
            detail: `${s.numero} · ${formaterPeriode(s.dateDebut, s.dateFin)} · ${s.company?.raisonSociale ?? "Inter-entreprises"}`,
          }))}
        />
        <Groupe
          titre="Formations"
          voirTout={`/formations?q=${encodeURIComponent(terme)}`}
          resultats={formations.map((f) => ({ href: `/formations/${f.id}`, titre: f.titre, detail: f.reference }))}
        />
        <Groupe
          titre="Contacts"
          resultats={contacts.map((c) => ({
            href: `/entreprises/${c.company.id}`,
            titre: `${c.prenom} ${c.nom}`,
            detail: [c.fonction, c.company.raisonSociale].filter(Boolean).join(" · "),
          }))}
        />
        <Groupe
          titre="Prospects"
          resultats={prospects.map((p) => ({
            href: `/crm`,
            titre: `${p.prenom} ${p.nom}`,
            detail: [p.entreprise, p.email].filter(Boolean).join(" · ") || "—",
          }))}
        />
      </div>
    </>
  );
}
