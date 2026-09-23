import Link from "next/link";
import { notFound } from "next/navigation";

import { ListeDocuments, SELECTION_DOCUMENT_RESUME } from "@/app/(app)/_composants/liste-documents";
import { ListeSessions } from "@/app/(app)/_composants/liste-sessions";
import { EnvoiEmail } from "@/app/(app)/apprenants/[id]/envoi-email";
import { PhotoApprenant } from "@/app/(app)/apprenants/[id]/photo";
import { ActionsRgpd } from "@/app/(app)/apprenants/[id]/rgpd";
import { SelecteurStatutApprenant } from "@/app/(app)/apprenants/[id]/selecteur-statut";
import { LIBELLE_STATUT_EMAIL, TON_STATUT_EMAIL } from "@/lib/automatisations/libelles";
import { construireContexte } from "@/lib/emails/contexte";
import { envoiReelActif } from "@/lib/emails/envoi";
import { rendre } from "@/lib/emails/modeles";
import {
  LIBELLE_FINANCEMENT,
  TON_STATUT_APPRENANT,
} from "@/lib/apprenants-libelles";
import { formaterDate } from "@/lib/crm-libelles";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";

export const dynamic = "force-dynamic";

/// Jalons du parcours d'un apprenant (cahier des charges, section 10).
/// Chacun sera coché automatiquement par la phase qui le construit.
const PARCOURS = [
  { etape: "Création de la fiche", phase: null },
  { etape: "Inscription à une session", phase: null },
  { etape: "Documents déposés", phase: null },
  { etape: "Convention signée", phase: null },
  { etape: "Présences saisies", phase: null },
  { etape: "Évaluation des acquis", phase: null },
  { etape: "Attestation", phase: null },
  { etape: "Facturation", phase: null },
];

function Ligne({ libelle, valeur }: { libelle: string; valeur?: string | null }) {
  return (
    <div className="flex gap-3 border-t border-bordure-douce py-2 first:border-t-0">
      <dt className="w-36 shrink-0 text-[12.5px] text-texte-tenu">{libelle}</dt>
      <dd className="text-[13px]">{valeur?.trim() ? valeur : "—"}</dd>
    </div>
  );
}

export default async function PageApprenant({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");

  const { id } = await params;

  const apprenant = await prisma.learner.findFirst({
    where: { id, deletedAt: null },
    include: {
      company: { select: { id: true, raisonSociale: true } },
      inscriptions: {
        where: { session: { deletedAt: null } },
        orderBy: { session: { dateDebut: "desc" } },
        include: { session: { include: { formation: { select: { titre: true } } } } },
      },
      documents: SELECTION_DOCUMENT_RESUME,
      emails: { orderBy: { envoyeAt: "desc" }, take: 10 },
    },
  });

  if (!apprenant) notFound();

  // Modèles pré-remplis avec les informations de cet apprenant et de sa
  // session la plus récente, prêts à être relus et ajustés avant l'envoi.
  const derniereSession = apprenant.inscriptions[0]?.session;
  // Convention ou contrat signé, rattaché à l'apprenant ou à l'une de ses sessions.
  const idsSessions = apprenant.inscriptions.map((i) => i.session.id);
  const [modeles, contexte, presences, factures, evaluations, attestations, conventionsSignees] = await Promise.all([
    // Les modèles à lien personnel (questionnaire) partent depuis la fin de
    // formation, où le lien est créé : pas depuis la fiche.
    prisma.emailTemplate.findMany({
      where: { actif: true, NOT: [{ corps: { contains: "questionnaire.lien" } }, { sujet: { contains: "questionnaire.lien" } }] },
      orderBy: { nom: "asc" },
    }),
    construireContexte({
      learnerId: apprenant.id,
      sessionId: derniereSession?.id,
      companyId: apprenant.companyId ?? undefined,
    }),
    prisma.presence.count({ where: { learnerId: apprenant.id } }),
    // Facture émise pour l'apprenant ou pour l'une de ses sessions
    prisma.facture.count({
      where: { statut: { in: ["EMISE", "PAYEE"] }, OR: [{ learnerId: apprenant.id }, { sessionId: { in: idsSessions } }] },
    }),
    prisma.evaluationAcquis.count({ where: { learnerId: apprenant.id } }),
    prisma.document.count({ where: { learnerId: apprenant.id, deletedAt: null, type: { code: "ATTESTATION" } } }),
    prisma.signatureRequest.count({
      where: {
        statut: "SIGNEE",
        document: {
          deletedAt: null,
          type: { code: { in: ["CONVENTION", "CONTRAT"] } },
          OR: [{ learnerId: apprenant.id }, { sessionId: { in: idsSessions } }],
        },
      },
    }),
  ]);
  const modelesRendus = modeles.map((m) => {
    const sujet = rendre(m.sujet, contexte);
    const corps = rendre(m.corps, contexte);
    return {
      id: m.id,
      nom: m.nom,
      sujet: sujet.resultat,
      corps: corps.resultat,
      manquantes: [...new Set([...sujet.manquantes, ...corps.manquantes])],
    };
  });

  return (
    <>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-4">
          <PhotoApprenant
            id={apprenant.id}
            prenom={apprenant.prenom}
            nom={apprenant.nom}
            photoUrl={apprenant.photoCheminStockage || apprenant.email ? `/api/apprenants/${apprenant.id}/photo` : null}
            aUnePhoto={Boolean(apprenant.photoCheminStockage)}
          />
          <div>
            <Link
              href="/apprenants"
              className="text-[12.5px] font-semibold text-accent-fort hover:underline"
            >
              ← Apprenants
            </Link>
            <h1 className="mt-2 text-[22px] font-extrabold tracking-tight">
              {apprenant.prenom} {apprenant.nom}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/apprenants/${apprenant.id}/modifier`}
            className="rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] font-semibold"
          >
            Modifier
          </Link>
          <SelecteurStatutApprenant
            id={apprenant.id}
            statut={apprenant.statut}
            classeTon={TON_STATUT_APPRENANT[apprenant.statut]}
          />
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-bordure bg-surface p-5 shadow-sm">
          <h2 className="mb-3 text-[14.5px] font-bold">Identité</h2>
          <dl>
            <Ligne
              libelle="Date de naissance"
              valeur={apprenant.dateNaissance ? formaterDate(apprenant.dateNaissance) : null}
            />
            <Ligne libelle="Email" valeur={apprenant.email} />
            <Ligne libelle="Téléphone" valeur={apprenant.telephone} />
            <Ligne
              libelle="Adresse"
              valeur={[
                apprenant.adresse,
                [apprenant.codePostal, apprenant.ville].filter(Boolean).join(" "),
              ]
                .filter(Boolean)
                .join(", ")}
            />
            <Ligne libelle="Niveau d'études" valeur={apprenant.niveauEtudes} />
          </dl>

          <div className="mt-4 border-t border-bordure-douce pt-3">
            {utilisateur.role === "ADMIN" ? (
              <ActionsRgpd id={apprenant.id} nomComplet={`${apprenant.prenom} ${apprenant.nom}`} />
            ) : (
              <a href={`/api/apprenants/${apprenant.id}/export-rgpd`} className="rounded-lg border border-bordure bg-surface px-3 py-1.5 text-[12.5px] font-semibold">
                Exporter ses données
              </a>
            )}
          </div>

          <h2 className="mb-3 mt-6 text-[14.5px] font-bold">Administratif</h2>
          <dl>
            <Ligne
              libelle="Entreprise"
              valeur={apprenant.company?.raisonSociale ?? "Particulier"}
            />
            <Ligne
              libelle="Financement"
              valeur={LIBELLE_FINANCEMENT[apprenant.financement]}
            />
            <Ligne libelle="Numéro de dossier CPF" valeur={apprenant.numeroDossierCpf} />
            <Ligne libelle="Notes" valeur={apprenant.notes} />
          </dl>

          {apprenant.company && (
            <Link
              href={`/entreprises/${apprenant.company.id}`}
              className="mt-4 inline-block text-[12.5px] font-semibold text-accent-fort hover:underline"
            >
              Voir la fiche entreprise →
            </Link>
          )}
        </section>

        <section className="rounded-xl border border-bordure bg-surface p-5 shadow-sm">
          <h2 className="mb-1 text-[14.5px] font-bold">Parcours</h2>
          <p className="mb-4 text-[12px] text-texte-tenu">
            Chaque étape se coche d&apos;après les données enregistrées.
          </p>
          <ol>
            {PARCOURS.map((jalon, rang) => {
              // Chaque étape est vérifiée sur les données, jamais présumée.
              const fait =
                rang === 0 ||
                (jalon.etape === "Inscription à une session" && apprenant.inscriptions.length > 0) ||
                (jalon.etape === "Documents déposés" && apprenant.documents.length > 0) ||
                (jalon.etape === "Convention signée" && conventionsSignees > 0) ||
                (jalon.etape === "Présences saisies" && presences > 0) ||
                (jalon.etape === "Évaluation des acquis" && evaluations > 0) ||
                (jalon.etape === "Attestation" && attestations > 0) ||
                (jalon.etape === "Facturation" && factures > 0);
              return (
                <li
                  key={jalon.etape}
                  className="flex items-center gap-3 border-t border-bordure-douce py-2 first:border-t-0"
                >
                  <span
                    aria-hidden="true"
                    className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                      fait
                        ? "bg-succes/12 text-succes"
                        : "bg-surface-creuse text-texte-tenu"
                    }`}
                  >
                    {fait ? "✓" : rang + 1}
                  </span>
                  <span
                    className={`text-[13px] ${fait ? "font-semibold" : "text-texte-tenu"}`}
                  >
                    {jalon.etape}
                  </span>
                  {jalon.phase && !fait && (
                    <span className="ml-auto rounded-full bg-bordure-douce px-1.5 py-px text-[10px] text-texte-tenu">
                      P{jalon.phase}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      </div>
      <div className="mt-4">
        <ListeSessions
          titre="Sessions suivies"
          messageVide="Cet apprenant n'est inscrit à aucune session. L'inscription se fait depuis la fiche d'une session."
          sessions={apprenant.inscriptions.map(({ session }) => ({
            id: session.id,
            numero: session.numero,
            dateDebut: session.dateDebut,
            dateFin: session.dateFin,
            statut: session.statut,
            titre: session.formation.titre,
            sousTitre: session.numero,
          }))}
        />
      </div>
      <div className="mt-4">
        <ListeDocuments documents={apprenant.documents} lienAjout={`apprenant=${apprenant.id}`} />
      </div>

      <section className="mt-4 rounded-xl border border-bordure bg-surface p-5 shadow-sm">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-[14.5px] font-bold">
            Emails <span className="font-normal text-texte-tenu">({apprenant.emails.length})</span>
          </h2>
        </div>
        {apprenant.emails.length > 0 && (
          <ul className="mb-4">
            {apprenant.emails.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 border-t border-bordure-douce py-2 first:border-t-0">
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold">{e.sujet}</div>
                  <div className="text-[11.5px] text-texte-tenu">{formaterDate(e.envoyeAt)}</div>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${TON_STATUT_EMAIL[e.statut]}`}>
                  {LIBELLE_STATUT_EMAIL[e.statut]}
                </span>
              </li>
            ))}
          </ul>
        )}
        <EnvoiEmail learnerId={apprenant.id} email={apprenant.email} modeles={modelesRendus} envoiReel={envoiReelActif()} />
      </section>
    </>
  );
}
