import Link from "next/link";
import { notFound } from "next/navigation";

import { ListeDocuments, SELECTION_DOCUMENT_RESUME } from "@/app/(app)/_composants/liste-documents";
import { ReponsesQuestionnaires, SELECTION_REPONSES } from "@/app/(app)/_composants/reponses-questionnaires";
import { ListeSessions } from "@/app/(app)/_composants/liste-sessions";
import { basculerActifFormateur } from "@/app/(app)/formateurs/actions";
import { AccesFormateur } from "@/app/(app)/formateurs/[id]/acces";
import { LIBELLE_STATUT_FORMATEUR } from "@/lib/formateurs";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";

export const dynamic = "force-dynamic";

const horodatage = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Paris",
});

function Ligne({ libelle, valeur }: { libelle: string; valeur?: string | null }) {
  return (
    <div className="flex gap-3 border-t border-bordure-douce py-2 first:border-t-0">
      <dt className="w-36 shrink-0 text-[12.5px] text-texte-tenu">{libelle}</dt>
      <dd className="text-[13px]">{valeur?.trim() ? valeur : "—"}</dd>
    </div>
  );
}

export default async function PageFormateur({ params }: { params: Promise<{ id: string }> }) {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");
  const { id } = await params;

  const f = await prisma.trainer.findFirst({
    where: { id, deletedAt: null },
    include: {
      user: { select: { email: true, isActive: true, role: true } },
      sessions: {
        where: { deletedAt: null },
        orderBy: { dateDebut: "desc" },
        include: { formation: { select: { titre: true } }, company: { select: { raisonSociale: true } } },
      },
      documents: SELECTION_DOCUMENT_RESUME,
      questionnaires: SELECTION_REPONSES,
    },
  });
  if (!f) notFound();

  // better-auth enregistre chaque connexion dans « session » : la plus récente
  // donne la dernière connexion.
  const derniere = f.userId
    ? await prisma.session.findFirst({ where: { userId: f.userId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } })
    : null;

  return (
    <>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/formateurs" className="text-[12.5px] font-semibold text-accent-fort hover:underline">
            ← Formateurs
          </Link>
          <h1 className="mt-2 text-[22px] font-extrabold tracking-tight">
            {f.prenom} {f.nom}
            {!f.actif && (
              <span className="ml-3 rounded-full bg-surface-creuse px-2.5 py-1 align-middle text-[11.5px] font-semibold text-texte-tenu">
                Inactif
              </span>
            )}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {(!f.actif || !f.user?.isActive || utilisateur.role === "ADMIN") && (
            <form action={basculerActifFormateur}>
              <input type="hidden" name="id" value={f.id} />
              <button type="submit" className="rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] font-semibold text-texte-doux">
                {f.actif ? "Désactiver" : "Réactiver"}
              </button>
            </form>
          )}
          <Link href={`/formateurs/${f.id}/modifier`} className="rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] font-semibold">
            Modifier
          </Link>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <section className="rounded-xl border border-bordure bg-surface p-5 shadow-sm">
            <h2 className="mb-3 text-[14.5px] font-bold">Informations</h2>
            <dl>
              <Ligne libelle="Email" valeur={f.email} />
              <Ligne libelle="Téléphone" valeur={f.telephone} />
              <Ligne libelle="Statut" valeur={LIBELLE_STATUT_FORMATEUR[f.statut]} />
              <Ligne libelle="SIRET" valeur={f.siret} />
              <Ligne libelle="Numéro de déclaration d'activité" valeur={f.numeroDeclaration} />
              <Ligne libelle="Spécialités" valeur={f.specialites} />
              <Ligne libelle="Taux de commissionnement" valeur={f.tauxCommissionnement !== null ? `${Number(f.tauxCommissionnement).toLocaleString("fr-FR")} %` : null} />
              <Ligne libelle="Notes" valeur={f.notes} />
            </dl>
          </section>

          <section className="rounded-xl border border-bordure bg-surface p-5 shadow-sm">
            <h2 className="mb-3 text-[14.5px] font-bold">Accès à l&apos;application</h2>
            {utilisateur.role === "ADMIN" ? (
              <AccesFormateur
                trainerId={f.id}
                ficheActive={f.actif}
                compte={
                  f.user
                    ? {
                        email: f.user.email,
                        actif: f.user.isActive,
                        derniereConnexion: derniere ? horodatage.format(derniere.createdAt) : null,
                      }
                    : null
                }
              />
            ) : (
              <p className="text-[12.8px] text-texte-doux">
                {f.user?.isActive ? "Accès ouvert." : "Aucun accès."} La gestion des accès est réservée aux administrateurs.
              </p>
            )}
          </section>
        </div>

        <div className="flex flex-col gap-4">
          <ListeSessions
            titre="Sessions"
            sessions={f.sessions.map((s) => ({
              id: s.id,
              numero: s.numero,
              dateDebut: s.dateDebut,
              dateFin: s.dateFin,
              statut: s.statut,
              titre: s.formation.titre,
              sousTitre: s.company?.raisonSociale ?? "Inter-entreprises",
            }))}
            lienCreation={f.actif ? `/sessions/nouvelle?formateur=${f.id}` : undefined}
            messageVide="Aucune session affectée à ce formateur."
          />
          <ListeDocuments
            documents={f.documents}
            lienAjout={`formateur=${f.id}`}
            raccourcis={[
              { libelle: "Ajouter le CV", type: "CV_FORMATEUR" },
              { libelle: "Ajouter le programme", type: "PROGRAMME" },
            ]}
          />
          <ReponsesQuestionnaires questionnaires={f.questionnaires} />
        </div>
      </div>
    </>
  );
}
