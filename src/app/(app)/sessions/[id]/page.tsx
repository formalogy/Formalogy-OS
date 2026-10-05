import Link from "next/link";
import { notFound } from "next/navigation";

import { ListeDocuments, SELECTION_DOCUMENT_RESUME } from "@/app/(app)/_composants/liste-documents";
import { GenerationConventions } from "@/app/(app)/sessions/[id]/conventions";
import { FinParcours } from "@/app/(app)/sessions/[id]/fin-parcours";
import { FriseSession } from "@/app/(app)/sessions/[id]/frise";
import { LancementSession } from "@/app/(app)/sessions/[id]/lancement";
import { BlocInfo, ListeActions, NavOnglets, ONGLETS, TexteCatalogue, type Action, type CleOnglet } from "@/app/(app)/sessions/[id]/onglets";
import { FormulaireInscription } from "@/app/(app)/sessions/[id]/formulaire-inscription";
import { SelecteurStatutSession } from "@/app/(app)/sessions/[id]/selecteur-statut";
import { FacturationInscription } from "@/app/(app)/sessions/[id]/facturation-inscription";
import { desinscrireApprenant } from "@/app/(app)/sessions/actions";
import { LIBELLE_FINANCEMENT } from "@/lib/apprenants-libelles";
import { joursDeSession } from "@/lib/emargement";
import { financeursConnus } from "@/lib/financeurs-connus";
import { decrirePayeur, type PayeurInscription } from "@/lib/inscriptions-facturation";
import { paiementAttendu, textePaiementAttendu } from "@/lib/paiements-attendus";
import { formaterDuree, LIBELLE_MODALITE, modaliteEnLigne } from "@/lib/formations-libelles";
import { LIBELLE_TYPE_QUESTIONNAIRE } from "@/lib/questionnaires-questions";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";
import { friseSession } from "@/lib/session-frise";
import {
  aujourdhuiUTC,
  formaterPeriode,
  listeDeControle,
  TON_STATUT_SESSION,
} from "@/lib/sessions-libelles";

const jourCourtSession = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export const dynamic = "force-dynamic";

function Ligne({ libelle, valeur }: { libelle: string; valeur?: React.ReactNode }) {
  return (
    <div className="flex gap-3 border-t border-bordure-douce py-2 first:border-t-0">
      <dt className="w-32 shrink-0 text-[12.5px] text-texte-tenu">{libelle}</dt>
      <dd className="text-[13px]">{valeur || "—"}</dd>
    </div>
  );
}

export default async function PageSession({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ onglet?: string }>;
}) {
  await exigerRole("ADMIN", "GESTIONNAIRE");
  const { id } = await params;
  const demande = (await searchParams).onglet;

  const session = await prisma.trainingSession.findFirst({
    where: { id, deletedAt: null },
    include: {
      company: { select: { id: true, raisonSociale: true } },
      trainer: { select: { id: true, prenom: true, nom: true, email: true, telephone: true, modalite: true, lieu: true, lieuEntreprise: true } },
      programme: { select: { id: true, nom: true } },
      questionnaires: { select: { type: true, envoyeAt: true, reponduAt: true } },
      satisfactions: { select: { envoyeAt: true, reponduAt: true } },
      evaluations: { select: { learnerId: true } },
      factures: { where: { statut: { not: "ANNULEE" } }, select: { id: true, statut: true, numero: true, learnerId: true } },
      dossiers: { select: { id: true, financeurNom: true } },
      // Convocations réellement parties (les envois simulés ne comptent pas)
      emails: {
        where: { statut: { in: ["ENVOYE", "DELIVRE", "OUVERT"] }, template: { code: "CONVOCATION" } },
        select: { learnerId: true },
      },
      formation: {
        select: {
          id: true,
          titre: true,
          reference: true,
          dureeHeures: true,
          dureeJours: true,
          description: true,
          objectifs: true,
          publicVise: true,
          prerequis: true,
          methodes: true,
          evaluation: true,
          accessibilite: true,
          typeCertification: true,
          certification: true,
          niveauCertification: true,
          _count: { select: { documents: { where: { deletedAt: null, type: { code: "PROGRAMME" } } } } },
        },
      },
      inscriptions: {
        orderBy: { learner: { nom: "asc" } },
        include: {
          learner: {
            select: { id: true, prenom: true, nom: true, email: true, financement: true, company: { select: { raisonSociale: true } } },
          },
          dossierFinancement: { select: { financeurNom: true, reference: true, email: true } },
        },
      },
      feuillesSignees: { select: { jour: true } },
      documents: {
        ...SELECTION_DOCUMENT_RESUME,
        select: {
          ...SELECTION_DOCUMENT_RESUME.select,
          type: { select: { nom: true, code: true } },
          signatures: { where: { statut: "SIGNEE" }, select: { id: true } },
          learnerId: true,
        },
      },
    },
  });
  if (!session) notFound();

  // Un formateur ne peut pas animer deux sessions aux mêmes dates : on le
  // signale sans bloquer (demi-journées, visio courte…).
  const conflits = session.trainerId
    ? await prisma.trainingSession.findMany({
        where: {
          id: { not: session.id },
          trainerId: session.trainerId,
          deletedAt: null,
          statut: { not: "ANNULEE" },
          dateDebut: { lte: session.dateFin },
          dateFin: { gte: session.dateDebut },
        },
        orderBy: { dateDebut: "asc" },
        select: { id: true, numero: true, dateDebut: true, dateFin: true, jours: true },
      })
    : [];

  const idsInscrits = session.inscriptions.map((i) => i.learner.id);
  // On propose en priorité les apprenants de l'entreprise cliente.
  const [candidats, financeurs, frise, docsAccueil] = await Promise.all([
    prisma.learner.findMany({
      where: { deletedAt: null, id: { notIn: idsInscrits }, statut: { not: "ABANDONNE" } },
      orderBy: [{ nom: "asc" }, { prenom: "asc" }],
      select: { id: true, prenom: true, nom: true, financement: true, companyId: true, company: { select: { raisonSociale: true } } },
    }),
    financeursConnus(),
    friseSession(session.id),
    // Livret d'accueil et règlement intérieur (Bibliothèque), joints aux bienvenues.
    prisma.document.findMany({
      where: { deletedAt: null, sessionId: null, learnerId: null, trainerId: null, type: { code: { in: ["LIVRET_ACCUEIL", "REGLEMENT_INTERIEUR"] } } },
      select: { type: { select: { code: true } } },
    }),
  ]);
  const candidatsTries = [
    ...candidats.filter((c) => session.companyId && c.companyId === session.companyId),
    ...candidats.filter((c) => !session.companyId || c.companyId !== session.companyId),
  ];

  const controle = listeDeControle({
    nombreInscrits: session.inscriptions.length,
    conventionDeposee: session.documents.some((d) => d.type?.code === "CONVENTION"),
    conventionSignee: session.documents.some((d) => d.type?.code === "CONVENTION" && d.signatures.length > 0),
    programmeDisponible:
      session.formation._count.documents > 0 || session.documents.some((d) => d.type?.code === "PROGRAMME"),
    convocationsEnvoyees:
      session.inscriptions.length > 0 && session.inscriptions.every((i) => session.emails.some((e) => e.learnerId === i.learner.id)),
    sessionPassee: session.dateFin < aujourdhuiUTC(),
    // Chaque jour passé de la session a sa feuille signée.
    feuilleEmargementDeposee:
      session.dateDebut <= aujourdhuiUTC() &&
      joursDeSession(session.dateDebut, session.dateFin, session.jours)
        .filter((j) => j <= aujourdhuiUTC())
        .every((j) => session.feuillesSignees.some((f) => f.jour.getTime() === j.getTime())),
    factureEmise: session.factures.some((f) => f.statut === "EMISE" || f.statut === "PAYEE"),
    // La ligne n'apparaît que si un dossier de financement existe.
    financementEnregistre: session.dossiers.length === 0 ? null : true,
    evaluationsCompletes:
      session.inscriptions.length > 0 && session.inscriptions.every((i) => session.evaluations.some((e) => e.learnerId === i.learner.id)),
    attestationsCompletes:
      session.inscriptions.length > 0 &&
      session.inscriptions.every((i) => session.documents.some((d) => d.type?.code === "ATTESTATION" && d.learnerId === i.learner.id)),
  });
  const faits = controle.filter((c) => c.fait).length;
  const complete = session.placesMax !== null && session.inscriptions.length >= session.placesMax;
  // Quand chaque payeur règle d'habitude, compté depuis la sortie de formation.
  const enLigne = modaliteEnLigne(session.modalite);
  // En ligne, la sortie de formation est la fin du parcours du stagiaire.
  const attenduPour = (payeur: Parameters<typeof paiementAttendu>[0], parcoursTermineLe: Date | null) => {
    const attendu = paiementAttendu(payeur, parcoursTermineLe ?? session.dateFin);
    return attendu ? textePaiementAttendu(attendu) : undefined;
  };

  const onglet: CleOnglet = ONGLETS.some((o) => o.cle === demande) ? (demande as CleOnglet) : "actions";
  const modifier = `/sessions/${session.id}/modifier`;
  const aPlanifier = !enLigne && session.jours.length === 0;
  const sansTarif = session.inscriptions.filter((i) => i.prixHT === null);
  const programmePresent = Boolean(session.programme) || session.formation._count.documents > 0;
  const actions: Action[] = [
    session.trainer
      ? { libelle: `Formateur : ${session.trainer.prenom} ${session.trainer.nom}`, fait: true }
      : { libelle: "Aucun formateur ne participe", fait: false, lien: modifier },
    session.inscriptions.length > 0
      ? { libelle: `${session.inscriptions.length} participant${session.inscriptions.length > 1 ? "s" : ""}`, fait: true }
      : { libelle: "Aucun apprenant ne participe", fait: false, lien: `/sessions/${session.id}?onglet=participants` },
    enLigne
      ? { libelle: `Parcours en ligne du ${jourCourtSession.format(session.dateDebut)} au ${jourCourtSession.format(session.dateFin)}`, fait: true }
      : aPlanifier
        ? { libelle: "Aucune séance n'est planifiée", fait: false, lien: modifier, detail: "Cochez les jours de formation sur le calendrier." }
        : { libelle: `${session.jours.length} séance${session.jours.length > 1 ? "s" : ""} planifiée${session.jours.length > 1 ? "s" : ""}`, fait: true },
    ...(session.inscriptions.length > 0
      ? [
          sansTarif.length === 0
            ? { libelle: "Tarif de chaque participant renseigné", fait: true }
            : {
                libelle: `Tarif à renseigner pour ${sansTarif.map((i) => `${i.learner.prenom} ${i.learner.nom}`).join(", ")}`,
                fait: false,
                lien: `/sessions/${session.id}?onglet=participants`,
                bouton: "Renseigner",
              },
        ]
      : []),
    ...(enLigne && session.interne && !session.plateforme
      ? [{ libelle: "Plateforme e-learning à choisir", fait: false, lien: modifier, bouton: "Choisir" }]
      : []),
    session.formation.dureeHeures
      ? { libelle: "Durée de la formation renseignée", fait: true }
      : { libelle: "Durée en heures de la formation à renseigner", fait: false, lien: `/formations/${session.formation.id}/modifier`, bouton: "Compléter" },
    programmePresent
      ? { libelle: `Programme${session.programme ? ` : ${session.programme.nom}` : " de la formation"}`, fait: true }
      : {
          libelle: "Aucun programme de formation",
          fait: false,
          lien: session.trainer ? `/documents/nouveau?formateur=${session.trainer.id}&formation=${session.formation.id}&type=PROGRAMME` : `/documents/nouveau?formation=${session.formation.id}&type=PROGRAMME`,
        },
    session.formation.description?.trim() && session.formation.objectifs?.trim()
      ? { libelle: "Description et objectifs renseignés", fait: true }
      : { libelle: "Description ou objectifs à compléter dans le catalogue", fait: false, lien: `/formations/${session.formation.id}/modifier`, bouton: "Compléter" },
    docsAccueil.some((d) => d.type?.code === "LIVRET_ACCUEIL") && docsAccueil.some((d) => d.type?.code === "REGLEMENT_INTERIEUR")
      ? { libelle: "Livret d'accueil et règlement intérieur disponibles", fait: true }
      : { libelle: "Livret d'accueil ou règlement intérieur absent de la Bibliothèque", fait: false, lien: "/documents/nouveau", bouton: "Déposer" },
  ];
  const aTraiter = actions.filter((a) => !a.fait).length;
  const repondus = (liste: { reponduAt: Date | null }[]) => liste.filter((q) => q.reponduAt).length;

  return (
    <>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/sessions" className="text-[12.5px] font-semibold text-accent-fort hover:underline">
            ← Sessions
          </Link>
          <h1 className="mt-2 text-[22px] font-extrabold tracking-tight">{session.formation.titre}</h1>
          <p className="mt-1 text-[12.5px] text-texte-doux">
            <span className="font-mono text-texte-tenu">{session.numero}</span> ·{" "}
            {aPlanifier ? "Séances à planifier" : formaterPeriode(session.dateDebut, session.dateFin)} · {LIBELLE_MODALITE[session.modalite]}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SelecteurStatutSession id={session.id} statut={session.statut} classeTon={TON_STATUT_SESSION[session.statut]} />
          <Link href={modifier} className="rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] font-semibold">
            Modifier
          </Link>
        </div>
      </header>

      <NavOnglets sessionId={session.id} actif={onglet} aTraiter={aTraiter} />

      {onglet === "formateurs" && conflits.length > 0 && (
        <p role="alert" className="mb-4 rounded-lg bg-alerte/12 px-3 py-2 text-[12.5px] text-alerte">
          Attention : ce formateur est aussi affecté aux mêmes dates à{" "}
          {conflits.map((c, i) => (
            <span key={c.id}>
              {i > 0 && ", "}
              <Link href={`/sessions/${c.id}`} className="font-semibold underline">
                {c.numero}
              </Link>{" "}
              ({formaterPeriode(c.dateDebut, c.dateFin)})
            </span>
          ))}
          .
        </p>
      )}

      {onglet === "actions" && (
        <div className="flex flex-col gap-5">
          <ListeActions actions={actions} />
          <div className="max-w-3xl empty:hidden">
            <LancementSession sessionId={session.id} statut={session.statut} suspenduLe={session.deroulementSuspenduAt?.toISOString() ?? null} />
          </div>
        </div>
      )}

      {onglet === "informations" && (
        <div className="flex max-w-3xl flex-col gap-3">
          <BlocInfo titre="Description de la session" badge={session.formation.description?.trim() ? "✓ Renseignée" : "À compléter"} aCompleter={!session.formation.description?.trim()}>
            <TexteCatalogue texte={session.formation.description} />
          </BlocInfo>
          <BlocInfo
            titre="Séances"
            badge={enLigne ? "Parcours en ligne" : aPlanifier ? "Aucune séance" : `${session.jours.length} séance${session.jours.length > 1 ? "s" : ""}`}
            aCompleter={aPlanifier}
            ouvert={aPlanifier}
          >
            <dl>
              {enLigne ? (
                <Ligne libelle="Période" valeur={formaterPeriode(session.dateDebut, session.dateFin)} />
              ) : (
                <Ligne libelle="Jours" valeur={aPlanifier ? "Aucun jour coché" : session.jours.map((j) => jourCourtSession.format(j)).join(", ")} />
              )}
              {!enLigne && <Ligne libelle="Horaires" valeur={session.horaires} />}
              <Ligne libelle="Lieu" valeur={enLigne ? "À distance" : session.lieu} />
              <Ligne libelle="Entreprise" valeur={session.company ? <Link href={`/entreprises/${session.company.id}`} className="hover:text-accent-fort">{session.company.raisonSociale}</Link> : "Inter-entreprises"} />
            </dl>
            <Link href={modifier} className="mt-2 inline-block text-[12.5px] font-semibold text-accent-fort underline">
              {aPlanifier ? "Planifier les séances" : "Modifier les séances"}
            </Link>
          </BlocInfo>
          <BlocInfo titre="Objectifs pédagogiques" badge={session.formation.objectifs?.trim() ? "✓ Renseignés" : "À compléter"} aCompleter={!session.formation.objectifs?.trim()}>
            <TexteCatalogue texte={session.formation.objectifs} />
          </BlocInfo>
          <BlocInfo titre="Public visé et prérequis" badge={session.formation.publicVise?.trim() || session.formation.prerequis?.trim() ? "✓ Renseignés" : "À compléter"} aCompleter={!session.formation.publicVise?.trim() && !session.formation.prerequis?.trim()}>
            <h3 className="mb-1 text-[11.5px] font-semibold uppercase tracking-wider text-texte-tenu">Public visé</h3>
            <TexteCatalogue texte={session.formation.publicVise} />
            <h3 className="mb-1 mt-3 text-[11.5px] font-semibold uppercase tracking-wider text-texte-tenu">Prérequis</h3>
            <TexteCatalogue texte={session.formation.prerequis} />
          </BlocInfo>
          <BlocInfo titre="Méthodes de formation et évaluation" badge={session.formation.methodes?.trim() ? "✓ Renseignées" : "À compléter"} aCompleter={!session.formation.methodes?.trim()}>
            <h3 className="mb-1 text-[11.5px] font-semibold uppercase tracking-wider text-texte-tenu">Méthodes et moyens pédagogiques</h3>
            <TexteCatalogue texte={session.formation.methodes} />
            <h3 className="mb-1 mt-3 text-[11.5px] font-semibold uppercase tracking-wider text-texte-tenu">Modalités d&apos;évaluation</h3>
            <TexteCatalogue texte={session.formation.evaluation} />
            <h3 className="mb-1 mt-3 text-[11.5px] font-semibold uppercase tracking-wider text-texte-tenu">Accessibilité et délai d&apos;accès</h3>
            <TexteCatalogue texte={session.formation.accessibilite} />
          </BlocInfo>
          <BlocInfo
            titre="Spécificités de la session"
            badge={session.formation.typeCertification === "RNCP" ? `RNCP${session.formation.niveauCertification ? ` – Niveau ${session.formation.niveauCertification}` : ""}` : session.formation.typeCertification === "RS" ? "RS" : "Non certifiante"}
          >
            <dl>
              <Ligne libelle="Certification" valeur={session.formation.certification} />
              <Ligne libelle="Durée" valeur={formaterDuree(session.formation.dureeHeures, session.formation.dureeJours)} />
              <Ligne libelle="Référence" valeur={session.formation.reference} />
            </dl>
          </BlocInfo>
          <p className="text-[12px] text-texte-tenu">
            Ces informations viennent du catalogue :{" "}
            <Link href={`/formations/${session.formation.id}/modifier`} className="font-semibold underline">modifier la formation</Link>{" "}
            les met à jour pour toutes ses sessions.
          </p>
        </div>
      )}

      {onglet === "participants" && (
        <div className="flex max-w-3xl flex-col gap-4">
          <section className="rounded-xl border border-bordure bg-surface p-5 shadow-sm">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="text-[14.5px] font-bold">
                Apprenants inscrits{" "}
                <span className="font-normal text-texte-tenu">
                  ({session.inscriptions.length}
                  {session.placesMax ? ` / ${session.placesMax}` : ""})
                </span>
              </h2>
              {complete && (
                <span className="rounded-full bg-alerte/12 px-2 py-0.5 text-[11px] font-semibold text-alerte">
                  Complète
                </span>
              )}
            </div>

            {session.inscriptions.length === 0 ? (
              <p className="mb-4 text-[12.8px] text-texte-doux">Aucun apprenant inscrit pour le moment.</p>
            ) : (
              <ul className="mb-4">
                {session.inscriptions.map(({ learner, prixHT, facturerA, dossierFinancement, factureId, parcoursTermineLe }) => (
                  <li
                    key={learner.id}
                    className="flex items-center justify-between gap-3 border-t border-bordure-douce py-2 first:border-t-0"
                  >
                    <div className="min-w-0">
                      <Link href={`/apprenants/${learner.id}`} className="text-[13px] font-semibold hover:text-accent-fort">
                        {learner.prenom} {learner.nom}
                      </Link>
                      <div className="truncate text-[11.5px] text-texte-tenu">
                        {[learner.company?.raisonSociale, LIBELLE_FINANCEMENT[learner.financement], learner.email]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                      <FacturationInscription
                        sessionId={session.id}
                        learnerId={learner.id}
                        description={decrirePayeur(facturerA, {
                          entreprise: learner.company?.raisonSociale ?? session.company?.raisonSociale,
                          financeur: dossierFinancement?.financeurNom,
                          dossier: dossierFinancement?.reference,
                        })}
                        payeur={facturerA as PayeurInscription}
                        prix={prixHT === null ? null : String(prixHT)}
                        financeur={{
                          nom: dossierFinancement?.financeurNom ?? null,
                          reference: dossierFinancement?.reference ?? null,
                          email: dossierFinancement?.email ?? null,
                        }}
                        financeursConnus={financeurs}
                        modifiable={!factureId}
                        paiementAttendu={attenduPour(facturerA, parcoursTermineLe)}
                      />
                      {enLigne && session.statut !== "ANNULEE" && (
                        <FinParcours sessionId={session.id} learnerId={learner.id} termineLe={parcoursTermineLe?.toISOString() ?? null} />
                      )}
                    </div>
                    <form action={desinscrireApprenant}>
                      <input type="hidden" name="sessionId" value={session.id} />
                      <input type="hidden" name="learnerId" value={learner.id} />
                      <button
                        type="submit"
                        className="shrink-0 rounded-lg px-2 py-1 text-[12px] font-semibold text-texte-tenu hover:bg-danger-pale hover:text-danger"
                      >
                        Retirer
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}

            {!complete && session.statut !== "ANNULEE" && session.statut !== "CLOTUREE" && (
              <FormulaireInscription
                sessionId={session.id}
                prixParDefaut={session.prixHT === null ? null : String(session.prixHT)}
                entrepriseSession={Boolean(session.companyId)}
                financeursConnus={financeurs}
                candidats={candidatsTries.map((c) => ({
                  id: c.id,
                  financement: c.financement,
                  aUneEntreprise: Boolean(c.companyId),
                  libelle: `${c.nom} ${c.prenom}${c.company ? ` — ${c.company.raisonSociale}` : ""}`,
                }))}
              />
            )}
          </section>
          <div className="flex flex-wrap gap-2">
            <Link href={session.dossiers[0] ? `/financements/${session.dossiers[0].id}` : `/financements/nouveau?session=${session.id}`} className="rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] font-semibold">
              {session.dossiers[0] ? "Prise en charge" : "Dossier de financement"}
            </Link>
            <Link href={session.factures[0] ? `/factures/${session.factures[0].id}` : `/factures/nouvelle?session=${session.id}`} className="rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] font-semibold">
              {session.factures[0] ? "Facture" : "Facturer à la main"}
            </Link>
          </div>
        </div>
      )}

      {onglet === "formateurs" && (
        <section className="max-w-3xl rounded-xl border border-bordure bg-surface p-5 shadow-sm">
          {session.trainer ? (
            <dl>
              <Ligne libelle="Formateur" valeur={<Link href={`/formateurs/${session.trainer.id}`} className="font-semibold hover:text-accent-fort">{session.trainer.prenom} {session.trainer.nom}</Link>} />
              <Ligne libelle="Coordonnées" valeur={[session.trainer.email, session.trainer.telephone].filter(Boolean).join(" · ")} />
              <Ligne libelle="Programme" valeur={session.programme ? session.programme.nom : "Aucun programme choisi"} />
              <Ligne libelle="Attribuée à" valeur={session.interne ? "Formalogy (formation en interne)" : "Le formateur"} />
            </dl>
          ) : (
            <p className="text-[13px] text-texte-doux">Aucun formateur pour le moment.</p>
          )}
          <Link href={modifier} className="mt-3 inline-block rounded-lg bg-texte px-3.5 py-2 text-[12.5px] font-semibold text-surface">
            {session.trainer ? "Changer de formateur ou de programme" : "Ajouter le formateur"}
          </Link>
        </section>
      )}

      {onglet === "documents" && (
        <div className="flex max-w-3xl flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {!enLigne && (
              <Link href={`/sessions/${session.id}/emargement`} className="rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] font-semibold">
                Émargement
              </Link>
            )}
            <Link href={`/sessions/${session.id}/fin-de-formation`} className="rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] font-semibold">
              Attestations et fin de formation
            </Link>
          </div>
          <ListeDocuments documents={session.documents} lienAjout={`session=${session.id}`} />

          {session.inscriptions.length > 0 && (
            <section className="rounded-xl border border-bordure bg-surface p-5 shadow-sm">
              <h2 className="text-[14.5px] font-bold">Conventions de formation</h2>
              <p className="mb-3 mt-1 text-[12.5px] text-texte-doux">
                Une convention par apprenant, remplie depuis le modèle déposé dans la bibliothèque. L&apos;envoi
                automatique d&apos;avant-formation les produit déjà : ce bouton sert si la session a été créée trop tard
                pour lui, ou si une information a changé depuis.
              </p>
              <GenerationConventions sessionId={session.id} />
            </section>
          )}
        </div>
      )}

      {onglet === "questionnaires" && (
        <section className="max-w-3xl rounded-xl border border-bordure bg-surface p-5 shadow-sm">
          <h2 className="mb-3 text-[14.5px] font-bold">Questionnaires de la session</h2>
          <dl>
            <Ligne libelle="Satisfaction à chaud" valeur={`${session.satisfactions.filter((q) => q.envoyeAt).length} envoyé(s), ${repondus(session.satisfactions)} réponse(s)`} />
            {(["POSITIONNEMENT", "CHAUD_FORMATEUR", "CLIENT", "FROID"] as const).map((type) => {
              const liste = session.questionnaires.filter((q) => q.type === type);
              return <Ligne key={type} libelle={LIBELLE_TYPE_QUESTIONNAIRE[type].replace(/ \(.*\)$/, "")} valeur={`${liste.filter((q) => q.envoyeAt).length} envoyé(s), ${repondus(liste)} réponse(s)`} />;
            })}
          </dl>
          <p className="mt-3 text-[12px] text-texte-tenu">
            Ils partent seuls aux dates de l&apos;onglet Déroulement. Réponses détaillées dans{" "}
            <Link href="/questionnaires" className="font-semibold underline">Questionnaires</Link> et sur{" "}
            <Link href={`/sessions/${session.id}/fin-de-formation`} className="font-semibold underline">la fin de formation</Link>.
          </p>
        </section>
      )}

      {onglet === "deroulement" && (
        <div className="grid max-w-5xl gap-4 lg:grid-cols-[1.4fr_1fr]">
          {frise ? <FriseSession phases={frise.phases} /> : <div />}
          <div className="self-start">
          <section className="rounded-xl border border-bordure bg-surface p-5 shadow-sm">
            <div className="mb-1 flex items-baseline justify-between">
              <h2 className="text-[14.5px] font-bold">Liste de contrôle</h2>
              <span className="font-mono text-[12px] tabular-nums text-texte-tenu">
                {faits} / {controle.length}
              </span>
            </div>
            <p className="mb-3 text-[12px] text-texte-tenu">
              Calculée à partir des données réelles de la session.
            </p>
            <ul>
              {controle.map((element) => (
                <li
                  key={element.libelle}
                  className="flex items-center gap-3 border-t border-bordure-douce py-2 first:border-t-0"
                >
                  <span
                    aria-hidden="true"
                    className={`flex size-5 shrink-0 items-center justify-center rounded-md border text-[11px] font-bold ${
                      element.fait ? "border-succes bg-succes text-white" : "border-bordure bg-surface"
                    }`}
                  >
                    {element.fait ? "✓" : ""}
                  </span>
                  <span className={`text-[13px] ${element.fait ? "font-semibold" : "text-texte-doux"}`}>
                    {element.libelle}
                  </span>
                  {element.phase && !element.fait && (
                    <span className="ml-auto rounded-full bg-bordure-douce px-1.5 py-px text-[10px] text-texte-tenu">
                      P{element.phase}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
          </div>
        </div>
      )}

      {onglet === "parametres" && (
        <div className="flex max-w-3xl flex-col gap-4">
          <section className="rounded-xl border border-bordure bg-surface p-5 shadow-sm">
            <h2 className="mb-3 text-[14.5px] font-bold">Réglages</h2>
            <dl>
              <Ligne libelle="Modalité" valeur={LIBELLE_MODALITE[session.modalite]} />
              <Ligne libelle="Attribuée à" valeur={session.interne ? "Formalogy (formation en interne)" : "Le formateur"} />
              {enLigne && <Ligne libelle="Plateforme" valeur={session.plateforme === "EFORMA" ? "E-forma" : session.plateforme === "MON_PARCOURS_EN_LIGNE" ? "Mon Parcours En Ligne" : "Gérée par le formateur"} />}
              <Ligne libelle="Émargement" valeur={session.modalite === "E_LEARNING" ? "Aucun (formation en ligne)" : "QR code par demi-journée"} />
              <Ligne libelle="Notes" valeur={session.notes} />
            </dl>
            <Link href={modifier} className="mt-3 inline-block text-[12.5px] font-semibold text-accent-fort underline">
              Modifier ces réglages
            </Link>
          </section>
          <LancementSession sessionId={session.id} statut={session.statut} suspenduLe={session.deroulementSuspenduAt?.toISOString() ?? null} />
        </div>
      )}
    </>
  );
}
