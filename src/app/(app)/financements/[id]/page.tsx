import Link from "next/link";
import { notFound } from "next/navigation";

import { ListeDocuments, SELECTION_DOCUMENT_RESUME } from "@/app/(app)/_composants/liste-documents";
import { ReponsesQuestionnaires, SELECTION_REPONSES } from "@/app/(app)/_composants/reponses-questionnaires";
import { supprimerDossier } from "@/app/(app)/financements/actions";
import { formaterMontant } from "@/lib/factures";
import { LIBELLE_FINANCEUR } from "@/lib/financements";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";

export const dynamic = "force-dynamic";

const jour = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });

function Ligne({ libelle, valeur }: { libelle: string; valeur?: React.ReactNode }) {
  return (
    <div className="flex gap-3 border-t border-bordure-douce py-2 first:border-t-0">
      <dt className="w-36 shrink-0 text-[12.5px] text-texte-tenu">{libelle}</dt>
      <dd className="text-[13px]">{valeur || "—"}</dd>
    </div>
  );
}

export default async function PageDossier({ params }: { params: Promise<{ id: string }> }) {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");
  const { id } = await params;

  const d = await prisma.dossierFinancement.findUnique({
    where: { id },
    include: {
      session: { select: { id: true, numero: true, formation: { select: { titre: true } } } },
      learner: { select: { id: true, prenom: true, nom: true } },
      company: { select: { id: true, raisonSociale: true } },
      facture: { select: { id: true, numero: true, statut: true } },
      questionnaires: SELECTION_REPONSES,
    },
  });
  if (!d) notFound();

  // Accord de prise en charge et autres pièces, rattachés à la session.
  const documents = d.sessionId
    ? await prisma.document.findMany({
        where: { ...SELECTION_DOCUMENT_RESUME.where, sessionId: d.sessionId, type: { code: "ACCORD_FINANCEMENT" } },
        orderBy: SELECTION_DOCUMENT_RESUME.orderBy,
        select: SELECTION_DOCUMENT_RESUME.select,
      })
    : [];

  return (
    <>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/financements" className="text-[12.5px] font-semibold text-accent-fort hover:underline">
            ← Prises en charge
          </Link>
          <h1 className="mt-2 text-[22px] font-extrabold tracking-tight">{d.financeurNom}</h1>
          <p className="mt-1 text-[12.5px] text-texte-doux">
            {LIBELLE_FINANCEUR[d.financeurType]}
            {d.reference ? ` · dossier ${d.reference}` : ""}
            {d.session ? ` · ${d.session.numero}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/financements/${d.id}/modifier`} className="rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] font-semibold">
            Modifier
          </Link>
          {utilisateur.role === "ADMIN" && (
            <form action={supprimerDossier}>
              <input type="hidden" name="id" value={d.id} />
              <button type="submit" className="rounded-lg px-3 py-2 text-[13px] font-semibold text-texte-tenu hover:bg-danger-pale hover:text-danger">
                Supprimer
              </button>
            </form>
          )}
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-bordure bg-surface p-5 shadow-sm">
          <h2 className="mb-3 text-[14.5px] font-bold">Dossier</h2>
          <dl>
            <Ligne libelle="Montant" valeur={d.montant && <span className="font-mono font-semibold text-succes">{formaterMontant(d.montant)}</span>} />
            <Ligne libelle="Subrogation" valeur={d.subrogation ? "Oui — le financeur paie l'organisme" : "Non — l'entreprise avance les frais"} />
            <Ligne libelle="Enregistré le" valeur={d.dateDepot && jour.format(d.dateDepot)} />
            <Ligne
              libelle="Session"
              valeur={d.session && <Link href={`/sessions/${d.session.id}`} className="hover:text-accent-fort">{d.session.formation.titre} ({d.session.numero})</Link>}
            />
            <Ligne libelle="Entreprise" valeur={d.company && <Link href={`/entreprises/${d.company.id}`} className="hover:text-accent-fort">{d.company.raisonSociale}</Link>} />
            <Ligne libelle="Apprenant" valeur={d.learner && <Link href={`/apprenants/${d.learner.id}`} className="hover:text-accent-fort">{d.learner.prenom} {d.learner.nom}</Link>} />
            <Ligne libelle="Facture" valeur={d.facture && <Link href={`/factures/${d.facture.id}`} className="hover:text-accent-fort">{d.facture.numero ?? "à émettre"}</Link>} />
            <Ligne libelle="Notes" valeur={d.notes} />
          </dl>
        </section>

        {d.sessionId && (
          <div className="flex flex-col gap-4">
            <ListeDocuments documents={documents} lienAjout={`session=${d.sessionId}&type=ACCORD_FINANCEMENT`} />
          </div>
        )}
      </div>

      <ReponsesQuestionnaires questionnaires={d.questionnaires} />
    </>
  );
}
