import Link from "next/link";
import { notFound } from "next/navigation";

import { EmissionFacture, SaisiePaiement } from "@/app/(app)/factures/[id]/actions-facture";
import { annulerFacture, supprimerPaiement } from "@/app/(app)/factures/actions";
import {
  depuisCentimes,
  formaterMontant,
  LIBELLE_MOYEN,
  LIBELLE_PAYEUR,
  LIBELLE_STATUT_FACTURE,
  situationFacture,
  TON_STATUT_FACTURE,
} from "@/lib/factures";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";
import { ajouterJours, aujourdhuiUTC, jourVersSaisie } from "@/lib/sessions-libelles";

export const dynamic = "force-dynamic";

const jour = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });

function Ligne({ libelle, valeur }: { libelle: string; valeur?: React.ReactNode }) {
  return (
    <div className="flex gap-3 border-t border-bordure-douce py-2 first:border-t-0">
      <dt className="w-32 shrink-0 text-[12.5px] text-texte-tenu">{libelle}</dt>
      <dd className="text-[13px]">{valeur || "—"}</dd>
    </div>
  );
}

export default async function PageFacture({ params }: { params: Promise<{ id: string }> }) {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");
  const { id } = await params;

  const f = await prisma.facture.findUnique({
    where: { id },
    include: {
      session: { select: { id: true, numero: true } },
      company: { select: { id: true, raisonSociale: true } },
      learner: { select: { id: true, prenom: true, nom: true } },
      document: { select: { id: true, deletedAt: true } },
      paiements: { orderBy: { date: "asc" }, include: { createdBy: { select: { name: true } } } },
    },
  });
  if (!f) notFound();

  const aujourdhui = aujourdhuiUTC();
  const situation = situationFacture(f, f.paiements, aujourdhui);
  const annulable = utilisateur.role === "ADMIN" && (f.statut === "A_EMETTRE" || f.statut === "EMISE") && f.paiements.length === 0;

  return (
    <>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/factures" className="text-[12.5px] font-semibold text-accent-fort hover:underline">
            ← Factures
          </Link>
          <h1 className="mt-2 text-[22px] font-extrabold tracking-tight">{f.numero ? `Facture ${f.numero}` : "Facture à émettre"}</h1>
          <p className="mt-1 text-[12.5px] text-texte-doux">{f.objet}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${TON_STATUT_FACTURE[f.statut]}`}>
            {LIBELLE_STATUT_FACTURE[f.statut]}
            {situation.enRetard && " · en retard"}
          </span>
          {f.statut === "A_EMETTRE" && (
            <Link href={`/factures/${f.id}/modifier`} className="rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] font-semibold">
              Modifier
            </Link>
          )}
          {annulable && (
            <form action={annulerFacture}>
              <input type="hidden" name="id" value={f.id} />
              <button type="submit" className="rounded-lg px-3 py-2 text-[13px] font-semibold text-texte-tenu hover:bg-danger-pale hover:text-danger">
                Annuler
              </button>
            </form>
          )}
        </div>
      </header>

      {f.statut === "EMISE" && annulable && (
        <p className="mb-4 text-[12px] text-texte-tenu">
          Annuler une facture émise dans Formalogy OS ne l&apos;annule pas dans Henrri : émettez-y un avoir.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-bordure bg-surface p-5 shadow-sm">
          <h2 className="mb-3 text-[14.5px] font-bold">Détail</h2>
          <dl>
            <Ligne libelle="Payeur" valeur={`${f.payeurNom} (${LIBELLE_PAYEUR[f.payeurType]})`} />
            <Ligne libelle="Montant HT" valeur={<span className="font-mono">{formaterMontant(f.montantHT)}</span>} />
            <Ligne libelle="TVA" valeur={`${Number(f.tauxTva).toLocaleString("fr-FR")} %`} />
            <Ligne libelle="Montant TTC" valeur={<span className="font-mono font-semibold">{formaterMontant(f.montantTTC)}</span>} />
            <Ligne libelle="Émise le" valeur={f.dateEmission && jour.format(f.dateEmission)} />
            <Ligne libelle="Échéance" valeur={f.dateEcheance && <span className={situation.enRetard ? "font-semibold text-danger" : ""}>{jour.format(f.dateEcheance)}</span>} />
            <Ligne libelle="Session" valeur={f.session && <Link href={`/sessions/${f.session.id}`} className="hover:text-accent-fort">{f.session.numero}</Link>} />
            <Ligne libelle="Entreprise" valeur={f.company && <Link href={`/entreprises/${f.company.id}`} className="hover:text-accent-fort">{f.company.raisonSociale}</Link>} />
            <Ligne libelle="Apprenant" valeur={f.learner && <Link href={`/apprenants/${f.learner.id}`} className="hover:text-accent-fort">{f.learner.prenom} {f.learner.nom}</Link>} />
            <Ligne libelle="PDF" valeur={f.document && !f.document.deletedAt && <Link href={`/documents/${f.document.id}`} className="font-semibold text-accent-fort hover:underline">Voir la facture</Link>} />
            <Ligne libelle="Notes" valeur={f.notes} />
          </dl>
        </section>

        <div className="flex flex-col gap-4">
          {f.statut === "A_EMETTRE" && (
            <section className="rounded-xl border border-bordure bg-surface p-5 shadow-sm">
              <h2 className="mb-3 text-[14.5px] font-bold">Émission dans Henrri</h2>
              <EmissionFacture id={f.id} aujourdhui={jourVersSaisie(aujourdhui)} echeanceParDefaut={jourVersSaisie(ajouterJours(aujourdhui, 30))} />
            </section>
          )}

          {f.statut !== "A_EMETTRE" && f.statut !== "ANNULEE" && (
            <section className="rounded-xl border border-bordure bg-surface p-5 shadow-sm">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="text-[14.5px] font-bold">Paiements</h2>
                <span className="font-mono text-[12.5px] tabular-nums">
                  {formaterMontant(situation.payeCentimes / 100)} / {formaterMontant(situation.totalCentimes / 100)}
                </span>
              </div>
              {f.paiements.length === 0 ? (
                <p className="mb-3 text-[12.8px] text-texte-doux">Aucun paiement reçu.</p>
              ) : (
                <ul className="mb-3">
                  {f.paiements.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 border-t border-bordure-douce py-2 first:border-t-0">
                      <div>
                        <div className="font-mono text-[13px] font-semibold">{formaterMontant(p.montant)}</div>
                        <div className="text-[11.5px] text-texte-tenu">
                          {jour.format(p.date)} · {LIBELLE_MOYEN[p.moyen]}
                          {p.reference ? ` · ${p.reference}` : ""}
                          {p.createdBy ? ` · saisi par ${p.createdBy.name}` : ""}
                        </div>
                      </div>
                      {utilisateur.role === "ADMIN" && (
                        <form action={supprimerPaiement}>
                          <input type="hidden" name="id" value={p.id} />
                          <button type="submit" className="rounded-lg px-2 py-1 text-[12px] font-semibold text-texte-tenu hover:bg-danger-pale hover:text-danger">
                            Supprimer
                          </button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {f.statut === "EMISE" && situation.resteCentimes > 0 && (
                <>
                  <p className="mb-2 text-[12.5px]">
                    Reste dû : <strong className="font-mono">{formaterMontant(situation.resteCentimes / 100)}</strong>
                  </p>
                  <SaisiePaiement factureId={f.id} reste={depuisCentimes(situation.resteCentimes).replace(".", ",")} aujourdhui={jourVersSaisie(aujourdhui)} />
                </>
              )}
            </section>
          )}
        </div>
      </div>
    </>
  );
}
