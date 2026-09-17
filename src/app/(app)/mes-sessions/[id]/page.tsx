import Link from "next/link";
import { notFound } from "next/navigation";

import { documentsVisiblesPourFormateur, formateurDuCompte } from "@/lib/formateurs";
import { LIBELLE_MODALITE } from "@/lib/formations-libelles";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";
import { formaterPeriode, LIBELLE_STATUT_SESSION, TON_STATUT_SESSION } from "@/lib/sessions-libelles";

export const dynamic = "force-dynamic";

function Ligne({ libelle, valeur }: { libelle: string; valeur?: string | null }) {
  return (
    <div className="flex gap-3 border-t border-bordure-douce py-2 first:border-t-0">
      <dt className="w-28 shrink-0 text-[12.5px] text-texte-tenu">{libelle}</dt>
      <dd className="text-[13px]">{valeur?.trim() ? valeur : "—"}</dd>
    </div>
  );
}

/// Fiche de session vue par son formateur : lecture seule, sans prix, sans
/// notes internes, sans coordonnées ni financement des apprenants.
export default async function PageMaSession({ params }: { params: Promise<{ id: string }> }) {
  const utilisateur = await exigerRole("FORMATEUR");
  const formateur = await formateurDuCompte(utilisateur.id);
  if (!formateur) notFound();
  const { id } = await params;

  // La condition sur le formateur fait partie de la requête : une session
  // d'un autre formateur est introuvable, exactement comme une session inexistante.
  const session = await prisma.trainingSession.findFirst({
    where: { id, trainerId: formateur.id, deletedAt: null, statut: { not: "BROUILLON" } },
    select: {
      id: true,
      numero: true,
      formationId: true,
      dateDebut: true,
      dateFin: true,
      horaires: true,
      lieu: true,
      modalite: true,
      statut: true,
      placesMax: true,
      formation: { select: { titre: true, reference: true } },
      company: { select: { raisonSociale: true } },
      inscriptions: {
        where: { learner: { deletedAt: null } },
        orderBy: [{ learner: { nom: "asc" } }, { learner: { prenom: "asc" } }],
        select: { learner: { select: { id: true, prenom: true, nom: true, company: { select: { raisonSociale: true } } } } },
      },
    },
  });
  if (!session) notFound();

  const documents = await prisma.document.findMany({
    where: {
      AND: [
        documentsVisiblesPourFormateur(formateur.id),
        { OR: [{ sessionId: session.id }, { formationId: session.formationId }] },
      ],
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      nom: true,
      type: { select: { nom: true } },
      versions: { orderBy: { numero: "desc" }, take: 1, select: { id: true, nomFichier: true } },
    },
  });

  return (
    <>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/mes-sessions" className="text-[12.5px] font-semibold text-accent-fort hover:underline">
            ← Mes sessions
          </Link>
          <h1 className="mt-2 text-[22px] font-extrabold tracking-tight">{session.formation.titre}</h1>
          <p className="mt-1 text-[12.5px] text-texte-doux">
            <span className="font-mono text-texte-tenu">{session.numero}</span> · {formaterPeriode(session.dateDebut, session.dateFin)}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${TON_STATUT_SESSION[session.statut]}`}>
          {LIBELLE_STATUT_SESSION[session.statut]}
        </span>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <section className="rounded-xl border border-bordure bg-surface p-5 shadow-sm">
            <h2 className="mb-3 text-[14.5px] font-bold">Informations pratiques</h2>
            <dl>
              <Ligne libelle="Horaires" valeur={session.horaires} />
              <Ligne libelle="Lieu" valeur={session.lieu} />
              <Ligne libelle="Modalité" valeur={LIBELLE_MODALITE[session.modalite]} />
              <Ligne libelle="Client" valeur={session.company?.raisonSociale ?? "Inter-entreprises"} />
            </dl>
          </section>

          <section className="rounded-xl border border-bordure bg-surface p-5 shadow-sm">
            <h2 className="mb-3 text-[14.5px] font-bold">
              Documents <span className="font-normal text-texte-tenu">({documents.length})</span>
            </h2>
            {documents.length === 0 ? (
              <p className="text-[12.8px] text-texte-doux">Aucun programme, convocation ou feuille d&apos;émargement disponible.</p>
            ) : (
              <ul>
                {documents.map((d) =>
                  d.versions[0] ? (
                    <li key={d.id} className="border-t border-bordure-douce first:border-t-0">
                      <a
                        href={`/api/documents/versions/${d.versions[0].id}`}
                        target="_blank"
                        rel="noopener"
                        className="-mx-2 block rounded-lg px-2 py-2 hover:bg-surface-creuse"
                      >
                        <div className="text-[13px] font-semibold">{d.nom}</div>
                        <div className="text-[11.5px] text-texte-tenu">{d.type?.nom} · {d.versions[0].nomFichier}</div>
                      </a>
                    </li>
                  ) : null,
                )}
              </ul>
            )}
          </section>
        </div>

        <section className="self-start rounded-xl border border-bordure bg-surface p-5 shadow-sm">
          <h2 className="mb-3 text-[14.5px] font-bold">
            Apprenants{" "}
            <span className="font-normal text-texte-tenu">
              ({session.inscriptions.length}
              {session.placesMax ? ` / ${session.placesMax}` : ""})
            </span>
          </h2>
          {session.inscriptions.length === 0 ? (
            <p className="text-[12.8px] text-texte-doux">Aucun apprenant inscrit pour le moment.</p>
          ) : (
            <ul>
              {session.inscriptions.map(({ learner }) => (
                <li key={learner.id} className="border-t border-bordure-douce py-2 first:border-t-0">
                  <div className="text-[13px] font-semibold">{learner.prenom} {learner.nom}</div>
                  {learner.company && <div className="text-[11.5px] text-texte-tenu">{learner.company.raisonSociale}</div>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
