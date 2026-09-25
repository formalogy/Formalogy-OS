import "server-only";

import { createHash } from "node:crypto";

import type { Automation, DeclencheurAutomatisation, TypeFinancement } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { genererConvention, genererConvocationApprenant } from "@/lib/conventions";
import { sessionEmargementAutomatique } from "@/lib/emargement-acces";
import { genererFeuillesEmargement } from "@/lib/emargement-pdf";
import { construireContexte } from "@/lib/emails/contexte";
import { envoyerEmail, type PieceJointe } from "@/lib/emails/envoi";
import { rendre } from "@/lib/emails/modeles";
import { genererDocumentsFinDeFormation } from "@/lib/fin-de-formation";
import { genererFactureHenrriPourSession } from "@/lib/henrri/facturation";
import { journaliser } from "@/lib/journal";
import { lireOrganisme } from "@/lib/organisme";
import { preparerLienQuestionnaireQualite } from "@/lib/questionnaires";
import { prisma } from "@/lib/prisma";
import { preparerLienQuestionnaire } from "@/lib/satisfaction";
import { ajouterJours, aujourdhuiUTC } from "@/lib/sessions-libelles";
import { appliquerStatutSession } from "@/lib/sessions-statut";
import { stockage } from "@/lib/stockage";

// ---------------------------------------------------------------------------
// Forme des règles
//
// Ajouter un type d'action ou un déclencheur se fait ici : le reste de
// l'application (écran, réveil quotidien) n'a pas à changer.
// ---------------------------------------------------------------------------

const schemaAction = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("EMAIL"),
    modele: z.string().min(1),
    /// APPRENANT : l'apprenant concerné ; APPRENANTS_SESSION : tous les
    /// inscrits de la session ; FORMATEUR_SESSION : le formateur de la
    /// session ; PAYEUR : le payeur de la facture émise pour la session
    /// (entreprise, ou apprenant) ; FORMATEURS_ACTIFS et FINANCEURS_ANNEE :
    /// les destinataires des campagnes annuelles, sans lien avec une session.
    destinataires: z.enum(["APPRENANT", "APPRENANTS_SESSION", "FORMATEUR_SESSION", "PAYEUR", "FORMATEURS_ACTIFS", "FINANCEURS_ANNEE"]),
    /// Documents joints à l'email. CONVENTION fabrique la convention de
    /// l'apprenant à partir du modèle déposé, la range dans les documents de
    /// la session et l'attache. CONVOCATION produit le document de
    /// convocation. ATTESTATION et CERTIFICAT reprennent les documents déjà
    /// produits pour cet apprenant : si l'un manque (évaluation des acquis pas
    /// encore transmise), l'email attend et part à un passage suivant, une
    /// fois les documents prêts. EMARGEMENT produit la feuille du jour
    /// (formateur) ; FACTURE reprend le PDF de la facture (payeur), sans
    /// lequel rien ne part.
    joindre: z.array(z.enum(["CONVENTION", "CONVOCATION", "ATTESTATION", "CERTIFICAT", "EMARGEMENT", "FACTURE"])).optional(),
  }),
  z.object({
    type: z.literal("TACHE"),
    titre: z.string().min(1),
    delaiJours: z.number().int().min(0).max(365),
    priorite: z.enum(["BASSE", "NORMALE", "HAUTE"]),
  }),
  z.object({
    /// Émet automatiquement la facture Henrri de la session (Phase 16).
    /// Sans paramètre : le payeur et le montant se déduisent de la session.
    type: z.literal("FACTURE_HENRRI"),
  }),
  z.object({
    /// Génère l'attestation et le certificat de réalisation des apprenants
    /// prêts (mêmes règles que le bouton manuel « Fin de formation ») : les
    /// apprenants dont les présences ou l'évaluation manquent sont ignorés.
    type: z.literal("DOCUMENTS_FIN_FORMATION"),
  }),
]);
export type ActionAutomatisation = z.infer<typeof schemaAction>;

const schemaConditions = z.object({
  /// Ne traiter que les apprenants ayant l'un de ces financements
  financement: z.array(z.enum(["ENTREPRISE", "OPCO", "CPF", "FRANCE_TRAVAIL", "PERSONNEL", "AUTRE"])).optional(),
});

const schemaParametres = z.object({
  /// SESSION_AVANT_DEBUT : jours avant le début ; SESSION_AVANT_FIN : jours
  /// avant la fin ; SESSION_APRES_FIN : jours après la fin.
  jours: z.number().int().min(0).max(60).optional(),
  /// CAMPAGNE_ANNUELLE : date fixe dans l'année.
  jour: z.number().int().min(1).max(31).optional(),
  mois: z.number().int().min(1).max(12).optional(),
  /// Heure de Paris à partir de laquelle l'envoi est autorisé le jour prévu
  /// (campagnes et déclencheurs de session) : le mail de fin part en fin de
  /// journée, la feuille d'émargement le matin.
  heure: z.number().int().min(0).max(23).optional(),
});

export function lireRegle(automation: Automation) {
  return {
    actions: z.array(schemaAction).parse(automation.actions),
    conditions: schemaConditions.parse(automation.conditions ?? {}),
    parametres: schemaParametres.parse(automation.parametres ?? {}),
  };
}

// ---------------------------------------------------------------------------
// Exécution d'un cas
// ---------------------------------------------------------------------------

type Cas = {
  cle: string;
  entityType: string;
  entityId: string;
  learnerId?: string;
  sessionId?: string;
  prospectId?: string;
  companyId?: string;
  dossierId?: string;
};

/// Heure locale française, quelle que soit l'heure du serveur. On lit la
/// partie « heure » du format plutôt que la chaîne entière : en français,
/// celle-ci vaut « 10 h », dont la conversion en nombre échouerait.
const FORMAT_HEURE = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", hour12: false, timeZone: "Europe/Paris" });

function heureDeParis(instant: Date): number {
  const partie = FORMAT_HEURE.formatToParts(instant).find((p) => p.type === "hour");
  return partie ? Number(partie.value) : instant.getUTCHours();
}

type ComptesEnvoi = { emails: number; simules: number; sansAdresse: number; ignores: number };

/// Bilan d'un cas, détaillé dans l'historique de l'automatisation.
type Comptes = ComptesEnvoi & {
  dejaServis: number;
  taches: number;
  factures: number;
  documents: number;
  conventions: number;
  documentsAbsents: number;
  sansFormateur: number;
  factureAbsente: number;
};

/// Le jour prévu, un envoi attend l'heure dite (heure de Paris). Un réveil
/// manqué ne fait rien perdre : passé ce jour-là, l'envoi part sans attendre.
function avantLHeure(jourPrevu: Date, heure: number | undefined): boolean {
  if (heure === undefined) return false;
  return aujourdhuiUTC().getTime() === jourPrevu.getTime() && heureDeParis(new Date()) < heure;
}

/// Sessions qu'un déclencheur de session peut regarder : ni supprimées, ni
/// suspendues par une alerte du client.
const SESSIONS_EN_ROUTE = { deletedAt: null, deroulementSuspenduAt: null } as const;

/// Envoi d'une campagne annuelle : à tous les formateurs actifs, ou à tous
/// les financeurs de l'année écoulée. Un destinataire sans adresse est
/// compté et passé ; un lien de questionnaire déjà utilisé fait sauter le
/// destinataire, comme pour les apprenants.
async function envoyerCampagne(params: {
  cible: "FORMATEURS_ACTIFS" | "FINANCEURS_ANNEE";
  modele: { id: string; sujet: string; corps: string };
  executionId: string;
  comptes: ComptesEnvoi;
}) {
  const { cible, modele, executionId, comptes } = params;
  const texteModele = `${modele.sujet}${modele.corps}`;

  const destinataires =
    cible === "FORMATEURS_ACTIFS"
      ? (await prisma.trainer.findMany({ where: { deletedAt: null, actif: true }, orderBy: { nom: "asc" } })).map((f) => ({
          email: f.email,
          trainerId: f.id as string | undefined,
          dossierId: undefined as string | undefined,
        }))
      : await financeursDeLAnnee();

  for (const destinataire of destinataires) {
    if (!destinataire.email) {
      comptes.sansAdresse++;
      continue;
    }

    let lienSatisfactionFormateur: string | undefined;
    let lienFinanceur: string | undefined;
    if (destinataire.trainerId && texteModele.includes("{{questionnaire.lienSatisfactionFormateur}}")) {
      const lien = await preparerLienQuestionnaireQualite({ type: "SATISFACTION_FORMATEUR", trainerId: destinataire.trainerId });
      if (!lien) {
        comptes.ignores++;
        continue;
      }
      lienSatisfactionFormateur = lien;
    }
    if (destinataire.dossierId && texteModele.includes("{{questionnaire.lienFinanceur}}")) {
      const lien = await preparerLienQuestionnaireQualite({ type: "FINANCEUR", dossierFinancementId: destinataire.dossierId });
      if (!lien) {
        comptes.ignores++;
        continue;
      }
      lienFinanceur = lien;
    }

    const contexte = await construireContexte({
      trainerId: destinataire.trainerId,
      dossierId: destinataire.dossierId,
      lienSatisfactionFormateur,
      lienFinanceur,
    });
    const email = await envoyerEmail({
      destinataire: destinataire.email,
      sujet: rendre(modele.sujet, contexte).resultat,
      corps: rendre(modele.corps, contexte).resultat,
      corpsJournal:
        lienSatisfactionFormateur || lienFinanceur
          ? rendre(modele.corps, {
              ...contexte,
              "questionnaire.lienSatisfactionFormateur": lienSatisfactionFormateur && "[lien personnel masqué]",
              "questionnaire.lienFinanceur": lienFinanceur && "[lien personnel masqué]",
            }).resultat
          : undefined,
      templateId: modele.id,
      automationRunId: executionId,
    });
    if (email.statut === "SIMULE") comptes.simules++;
    else if (email.statut === "ECHEC") comptes.ignores++;
    else comptes.emails++;
  }
}

/// Financeurs sollicités sur les douze derniers mois, une fois chacun :
/// plusieurs dossiers partagent souvent la même adresse, et personne ne doit
/// recevoir le questionnaire en double.
async function financeursDeLAnnee() {
  const debut = ajouterJours(aujourdhuiUTC(), -365);
  const dossiers = await prisma.dossierFinancement.findMany({
    where: { createdAt: { gte: debut }, email: { not: null } },
    orderBy: { createdAt: "desc" },
  });
  const parAdresse = new Map<string, { email: string | null; trainerId: string | undefined; dossierId: string | undefined }>();
  for (const d of dossiers) {
    const cle = (d.email ?? "").toLowerCase();
    if (!parAdresse.has(cle)) parAdresse.set(cle, { email: d.email, trainerId: undefined, dossierId: d.id });
  }
  return [...parAdresse.values()];
}

/// Reprend un document déjà produit pour un apprenant, afin de le joindre à
/// un email. Un document absent n'est jamais une erreur : il signifie que cet
/// apprenant n'était pas prêt (présences ou évaluation incomplètes).
async function pieceJointeDocument(
  typeCode: string,
  sessionId: string,
  learnerId: string,
): Promise<PieceJointe | null> {
  const document = await prisma.document.findFirst({
    where: { deletedAt: null, type: { code: typeCode }, sessionId, learnerId },
    include: { versions: { orderBy: { numero: "desc" }, take: 1 } },
  });
  const version = document?.versions[0];
  if (!version) return null;
  try {
    const blob = await stockage().lire(version.cheminStockage);
    return { nom: version.nomFichier, contenu: new Uint8Array(await blob.arrayBuffer()), typeMime: version.typeMime };
  } catch {
    console.error(`Document ${typeCode} introuvable dans le stockage : email envoyé sans lui.`);
    return null;
  }
}

/// Empreinte de la liste des inscrits d'une session. Elle entre dans la clé
/// d'unicité des automatisations de session : tant que la liste ne bouge pas,
/// le cas reste traité une fois pour toutes ; dès qu'un apprenant s'inscrit ou
/// se retire, le cas est réexaminé. Sans cela, un apprenant inscrit après le
/// premier envoi ne recevait jamais rien — ni questionnaire, ni convention.
async function empreinteInscrits(sessionId: string): Promise<string> {
  const inscriptions = await prisma.sessionLearner.findMany({
    where: { sessionId, learner: { deletedAt: null } },
    select: { learnerId: true },
  });
  const ids = inscriptions.map((i) => i.learnerId).sort().join(",");
  return createHash("sha256").update(ids).digest("hex").slice(0, 10);
}

/// Empreinte des évaluations des acquis d'une session. Elle entre dans la clé
/// des automatisations « après la fin » : l'évaluation arrive du formateur
/// en fin de parcours, parfois après le lendemain de la session ; chaque
/// évaluation reçue rouvre le cas, et les documents partent pour les
/// apprenants désormais prêts (les autres, déjà servis, ne reçoivent rien).
async function empreinteEvaluations(sessionId: string): Promise<string> {
  const evaluations = await prisma.evaluationAcquis.findMany({ where: { sessionId }, select: { learnerId: true, resultat: true } });
  const cles = evaluations.map((e) => `${e.learnerId}:${e.resultat}`).sort().join(",");
  return createHash("sha256").update(cles).digest("hex").slice(0, 10);
}

type ModeleEmail = { id: string; sujet: string; corps: string };

/// Email au formateur de la session : feuille d'émargement du jour, bilan de
/// fin de session avec l'évaluation des acquis. Un formateur ne reçoit qu'une
/// fois le même modèle pour une session (une fois par jour pour un envoi
/// quotidien), même si le cas est rouvert par une inscription tardive.
async function envoyerAuFormateur(p: {
  automation: Automation;
  cas: Cas;
  modele: ModeleEmail;
  joindre?: string[];
  executionId: string;
  comptes: Comptes;
}) {
  const { cas, modele, executionId, comptes } = p;
  if (!cas.sessionId) return;
  const session = await prisma.trainingSession.findUnique({
    where: { id: cas.sessionId },
    select: { trainer: { select: { id: true, email: true, deletedAt: true } } },
  });
  const formateur = session?.trainer && !session.trainer.deletedAt ? session.trainer : null;
  if (!formateur) {
    comptes.sansFormateur++;
    return;
  }
  if (!formateur.email) {
    comptes.sansAdresse++;
    return;
  }

  const deja = await prisma.email.count({
    where: {
      templateId: modele.id,
      sessionId: cas.sessionId,
      destinataire: formateur.email,
      statut: { not: "ECHEC" },
      automationRunId: { not: null },
      ...(p.automation.declencheur === "SESSION_JOUR" ? { envoyeAt: { gte: aujourdhuiUTC() } } : {}),
    },
  });
  if (deja > 0) {
    comptes.dejaServis++;
    return;
  }

  let lienChaudFormateur: string | undefined;
  if (`${modele.sujet}${modele.corps}`.includes("{{questionnaire.lienChaudFormateur}}")) {
    const lien = await preparerLienQuestionnaireQualite({ type: "CHAUD_FORMATEUR", sessionId: cas.sessionId, trainerId: formateur.id });
    // Déjà répondu : rien à redemander.
    if (!lien) {
      comptes.dejaServis++;
      return;
    }
    lienChaudFormateur = lien;
  }

  const piecesJointes: PieceJointe[] = [];
  if (p.joindre?.includes("EMARGEMENT")) {
    const session = await sessionEmargementAutomatique(cas.sessionId);
    if (session) {
      const jour = aujourdhuiUTC();
      piecesJointes.push({
        nom: `Emargement-${session.numero}-${jour.toISOString().slice(0, 10)}.pdf`,
        contenu: await genererFeuillesEmargement(session, (await lireOrganisme()).raisonSociale, jour, { seulementCeJour: true }),
        typeMime: "application/pdf",
      });
    }
  }

  const contexte = await construireContexte({ trainerId: formateur.id, sessionId: cas.sessionId, lienChaudFormateur });
  const email = await envoyerEmail({
    destinataire: formateur.email,
    sujet: rendre(modele.sujet, contexte).resultat,
    corps: rendre(modele.corps, contexte).resultat,
    corpsJournal: lienChaudFormateur
      ? rendre(modele.corps, { ...contexte, "questionnaire.lienChaudFormateur": "[lien personnel masqué]" }).resultat
      : undefined,
    templateId: modele.id,
    sessionId: cas.sessionId,
    automationRunId: executionId,
    piecesJointes: piecesJointes.length > 0 ? piecesJointes : undefined,
  });
  if (email.statut === "SIMULE") comptes.simules++;
  else if (email.statut === "ECHEC") throw new Error(`Email au formateur (${formateur.email}) : ${email.erreur}`);
  else comptes.emails++;
}

/// Email au payeur de la facture émise pour la session, avec son PDF. Sans
/// facture émise, sans PDF ou sans adresse, rien ne part : le tableau de
/// bord le signale, pour une intervention à la main.
async function envoyerAuPayeur(p: { cas: Cas; modele: ModeleEmail; joindre?: string[]; executionId: string; comptes: Comptes }) {
  const { cas, modele, executionId, comptes } = p;
  if (!cas.sessionId) return;
  const facture = await prisma.facture.findFirst({
    where: { sessionId: cas.sessionId, statut: { not: "ANNULEE" }, numero: { not: null } },
    orderBy: { createdAt: "desc" },
    include: {
      company: { select: { email: true } },
      learner: { select: { email: true } },
      document: { include: { versions: { orderBy: { numero: "desc" }, take: 1 } } },
    },
  });
  if (!facture) {
    comptes.factureAbsente++;
    return;
  }
  const adresse =
    facture.payeurType === "ENTREPRISE" ? facture.company?.email : facture.payeurType === "APPRENANT" ? facture.learner?.email : null;
  if (!adresse) {
    comptes.sansAdresse++;
    return;
  }
  const deja = await prisma.email.count({
    where: { templateId: modele.id, sessionId: cas.sessionId, destinataire: adresse, statut: { not: "ECHEC" }, automationRunId: { not: null } },
  });
  if (deja > 0) {
    comptes.dejaServis++;
    return;
  }

  const piecesJointes: PieceJointe[] = [];
  if (p.joindre?.includes("FACTURE")) {
    const version = facture.document?.versions[0];
    if (!version) {
      comptes.documentsAbsents++;
      return;
    }
    const blob = await stockage().lire(version.cheminStockage);
    piecesJointes.push({ nom: version.nomFichier, contenu: new Uint8Array(await blob.arrayBuffer()), typeMime: version.typeMime });
  }

  const contexte = await construireContexte({
    sessionId: cas.sessionId,
    companyId: facture.companyId ?? undefined,
    learnerId: facture.learnerId ?? undefined,
    factureId: facture.id,
  });
  const email = await envoyerEmail({
    destinataire: adresse,
    sujet: rendre(modele.sujet, contexte).resultat,
    corps: rendre(modele.corps, contexte).resultat,
    templateId: modele.id,
    sessionId: cas.sessionId,
    companyId: facture.companyId ?? undefined,
    learnerId: facture.learnerId ?? undefined,
    automationRunId: executionId,
    piecesJointes: piecesJointes.length > 0 ? piecesJointes : undefined,
  });
  if (email.statut === "SIMULE") comptes.simules++;
  else if (email.statut === "ECHEC") throw new Error(`Email au payeur (${adresse}) : ${email.erreur}`);
  else comptes.emails++;
}

/// Traite un cas une seule fois. La réservation se fait par l'insertion de la
/// trace d'exécution, dont la clé est unique en base : si deux exécutions
/// concurrentes visent le même cas, la seconde échoue à l'insertion et s'arrête.
async function traiterCas(automation: Automation, cas: Cas): Promise<"traite" | "deja"> {
  let executionId: string;
  try {
    const execution = await prisma.automationRun.create({
      data: {
        automationId: automation.id,
        cleUnicite: cas.cle,
        entityType: cas.entityType,
        entityId: cas.entityId,
        statut: "ECHEC",
        detail: "Exécution interrompue.",
      },
    });
    executionId = execution.id;
  } catch (erreur) {
    if (erreur instanceof Prisma.PrismaClientKnownRequestError && erreur.code === "P2002") return "deja";
    throw erreur;
  }

  const comptes: Comptes = {
    emails: 0,
    simules: 0,
    sansAdresse: 0,
    ignores: 0,
    dejaServis: 0,
    taches: 0,
    factures: 0,
    documents: 0,
    conventions: 0,
    documentsAbsents: 0,
    sansFormateur: 0,
    factureAbsente: 0,
  };
  // Motifs distincts d'échec de génération d'une convention, signalés dans le
  // bilan sans faire échouer l'envoi lui-même.
  const conventionsEchouees = new Set<string>();
  try {
    const { actions, conditions } = lireRegle(automation);
    const accepte = (financement: TypeFinancement) =>
      !conditions.financement || conditions.financement.includes(financement);

    for (const action of actions) {
      if (action.type === "EMAIL") {
        const modele = await prisma.emailTemplate.findUnique({ where: { code: action.modele } });
        if (!modele || !modele.actif) throw new Error(`Modèle d'email « ${action.modele} » introuvable ou désactivé.`);

        // Campagnes annuelles : destinataires sans lien avec une session, et
        // donc sans aucune des règles de session ci-dessous (conditions de
        // financement, questionnaires liés, pièces jointes). Branche à part,
        // pour ne rien changer au parcours apprenant.
        if (action.destinataires === "FORMATEURS_ACTIFS" || action.destinataires === "FINANCEURS_ANNEE") {
          await envoyerCampagne({
            cible: action.destinataires,
            modele,
            executionId,
            comptes,
          });
          continue;
        }
        if (action.destinataires === "FORMATEUR_SESSION") {
          await envoyerAuFormateur({ automation, cas, modele, joindre: action.joindre, executionId, comptes });
          continue;
        }
        if (action.destinataires === "PAYEUR") {
          await envoyerAuPayeur({ cas, modele, joindre: action.joindre, executionId, comptes });
          continue;
        }

        const destinataires =
          action.destinataires === "APPRENANT"
            ? cas.learnerId
              ? await prisma.learner.findMany({ where: { id: cas.learnerId, deletedAt: null } })
              : []
            : await prisma.learner.findMany({
                where: { deletedAt: null, inscriptions: { some: { sessionId: cas.sessionId } } },
              });

        // Un cas de session peut être rouvert par une inscription tardive.
        // Ceux qui ont déjà reçu ce modèle pour cette session sont alors
        // laissés de côté : c'est ici que se joue l'absence de doublon, et
        // non plus dans la clé du cas. Un envoi en échec ne compte pas : il
        // doit pouvoir être retenté.
        const dejaServis = cas.sessionId
          ? new Set(
              (
                await prisma.email.findMany({
                  where: {
                    templateId: modele.id,
                    sessionId: cas.sessionId,
                    statut: { not: "ECHEC" },
                    automationRunId: { not: null },
                    learnerId: { not: null },
                  },
                  select: { learnerId: true },
                })
              ).map((e) => e.learnerId as string),
            )
          : new Set<string>();

        for (const apprenant of destinataires) {
          if (dejaServis.has(apprenant.id)) {
            comptes.dejaServis++;
            continue;
          }
          if (!accepte(apprenant.financement)) {
            comptes.ignores++;
            continue;
          }
          if (!apprenant.email) {
            comptes.sansAdresse++;
            continue;
          }

          // Attestation et certificat : sans eux, l'email n'a pas d'objet. Il
          // attend (l'apprenant n'est pas compté comme servi) et partira à un
          // passage suivant, dès que ses documents existeront.
          const piecesJointes: PieceJointe[] = [];
          let documentManquant = false;
          for (const typeCode of ["ATTESTATION", "CERTIFICAT"] as const) {
            if (!action.joindre?.includes(typeCode) || !cas.sessionId) continue;
            const piece = await pieceJointeDocument(typeCode, cas.sessionId, apprenant.id);
            if (piece) piecesJointes.push(piece);
            else documentManquant = true;
          }
          if (documentManquant) {
            comptes.documentsAbsents++;
            continue;
          }

          // Modèle avec lien personnel vers un questionnaire : un lien par
          // apprenant, et rien à envoyer à qui a déjà répondu. La recherche
          // porte sur la variable complète (avec ses accolades) : un modèle
          // « lienPositionnement » ne doit pas déclencher le lien « lien ».
          const texteModele = `${modele.sujet}${modele.corps}`;
          let lienQuestionnaire: string | undefined;
          let lienPositionnement: string | undefined;
          let lienFroid: string | undefined;
          let questionnaireIgnore = false;

          if (cas.sessionId && texteModele.includes("{{questionnaire.lien}}")) {
            const lien = await preparerLienQuestionnaire(cas.sessionId, apprenant.id);
            if (!lien) questionnaireIgnore = true;
            else lienQuestionnaire = lien;
          }
          if (!questionnaireIgnore && cas.sessionId && texteModele.includes("{{questionnaire.lienPositionnement}}")) {
            const lien = await preparerLienQuestionnaireQualite({ type: "POSITIONNEMENT", sessionId: cas.sessionId, learnerId: apprenant.id });
            if (!lien) questionnaireIgnore = true;
            else lienPositionnement = lien;
          }
          if (!questionnaireIgnore && cas.sessionId && texteModele.includes("{{questionnaire.lienFroid}}")) {
            const lien = await preparerLienQuestionnaireQualite({ type: "FROID", sessionId: cas.sessionId, learnerId: apprenant.id });
            if (!lien) questionnaireIgnore = true;
            else lienFroid = lien;
          }
          if (questionnaireIgnore) {
            comptes.ignores++;
            continue;
          }

          // Convention et convocation, fabriquées à l'envoi. Une convention
          // qui ne peut pas l'être (modèle absent) n'empêche pas l'email de
          // partir : le message reste utile, le document se dépose à la main.
          for (const [type, produire] of [
            ["CONVENTION", genererConvention],
            ["CONVOCATION", genererConvocationApprenant],
          ] as const) {
            if (!action.joindre?.includes(type) || !cas.sessionId) continue;
            const produit = await produire({ sessionId: cas.sessionId, learnerId: apprenant.id });
            if ("erreur" in produit) conventionsEchouees.add(produit.erreur);
            else {
              piecesJointes.push({
                nom: produit.fichier.nom,
                contenu: produit.fichier.octets,
                typeMime: produit.fichier.typeMime,
              });
              comptes.conventions++;
            }
          }

          const contexte = await construireContexte({
            learnerId: apprenant.id,
            sessionId: cas.sessionId,
            companyId: apprenant.companyId ?? cas.companyId,
            lienQuestionnaire,
            lienPositionnement,
            lienFroid,
          });
          const email = await envoyerEmail({
            destinataire: apprenant.email,
            sujet: rendre(modele.sujet, contexte).resultat,
            corps: rendre(modele.corps, contexte).resultat,
            corpsJournal:
              lienQuestionnaire || lienPositionnement || lienFroid
                ? rendre(modele.corps, {
                    ...contexte,
                    "questionnaire.lien": lienQuestionnaire && "[lien personnel masqué]",
                    "questionnaire.lienPositionnement": lienPositionnement && "[lien personnel masqué]",
                    "questionnaire.lienFroid": lienFroid && "[lien personnel masqué]",
                  }).resultat
                : undefined,
            templateId: modele.id,
            learnerId: apprenant.id,
            sessionId: cas.sessionId,
            companyId: apprenant.companyId ?? undefined,
            automationRunId: executionId,
            piecesJointes: piecesJointes.length > 0 ? piecesJointes : undefined,
          });
          if (email.statut === "SIMULE") comptes.simules++;
          else if (email.statut === "ECHEC") throw new Error(`Email à ${apprenant.email} : ${email.erreur}`);
          else comptes.emails++;
        }
      }

      if (action.type === "TACHE") {
        const contexte = await construireContexte({
          learnerId: cas.learnerId,
          sessionId: cas.sessionId,
          prospectId: cas.prospectId,
          dossierId: cas.dossierId,
          companyId: cas.companyId,
        });
        await prisma.task.create({
          data: {
            titre: rendre(action.titre, contexte).resultat,
            echeance: ajouterJours(aujourdhuiUTC(), action.delaiJours),
            priorite: action.priorite,
            learnerId: cas.learnerId,
            sessionId: cas.sessionId,
            prospectId: cas.prospectId,
            companyId: cas.companyId,
            automationRunId: executionId,
          },
        });
        comptes.taches++;
      }

      if (action.type === "FACTURE_HENRRI") {
        if (!cas.sessionId) throw new Error("Facturation Henrri : aucune session associée à ce cas.");
        // Une erreur ici (Henrri injoignable, payeur ambigu, prix manquant…)
        // remonte telle quelle : message clair dans l'historique de
        // l'automatisation, et dans le journal d'activité (catch global
        // ci-dessous). La facture reste alors « à préparer » à la main.
        await genererFactureHenrriPourSession(cas.sessionId, undefined);
        comptes.factures++;
      }

      if (action.type === "DOCUMENTS_FIN_FORMATION") {
        if (!cas.sessionId) throw new Error("Documents de fin de formation : aucune session associée à ce cas.");
        // Les apprenants dont les présences ou l'évaluation manquent sont
        // simplement ignorés (bilan retourné par la fonction) : ce n'est pas
        // une erreur, ils recevront leurs documents à une exécution future.
        const r = await genererDocumentsFinDeFormation(cas.sessionId, undefined);
        if ("erreur" in r) throw new Error(r.erreur);
        comptes.documents += r.resultats.crees + r.resultats.misAJour;
      }
    }

    const parties = [
      comptes.emails && `${comptes.emails} email(s) envoyé(s)`,
      comptes.simules && `${comptes.simules} email(s) simulé(s)`,
      comptes.taches && `${comptes.taches} tâche(s) créée(s)`,
      comptes.factures && `${comptes.factures} facture(s) émise(s) via Henrri`,
      comptes.documents && `${comptes.documents} document(s) généré(s)`,
      comptes.conventions && `${comptes.conventions} document(s) fabriqué(s) et joint(s)`,
      comptes.documentsAbsents && `${comptes.documentsAbsents} envoi(s) en attente d'un document (évaluation des acquis ou PDF de facture pas encore disponible)`,
      comptes.sansFormateur && "aucun formateur affecté à la session",
      comptes.factureAbsente && "aucune facture émise pour la session",
      conventionsEchouees.size > 0 && `convention non générée — ${[...conventionsEchouees].join(" ; ")}`,
      comptes.dejaServis && `${comptes.dejaServis} destinataire(s) déjà servi(s)`,
      comptes.sansAdresse && `${comptes.sansAdresse} destinataire(s) sans adresse email`,
      comptes.ignores && `${comptes.ignores} apprenant(s) hors conditions`,
    ].filter(Boolean);
    const rienFait = comptes.emails + comptes.simules + comptes.taches + comptes.factures + comptes.documents === 0;

    await prisma.automationRun.update({
      where: { id: executionId },
      data: { statut: rienFait ? "IGNOREE" : "REUSSIE", detail: parties.join(", ") || "Aucun destinataire." },
    });
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message : "Erreur inconnue.";
    console.error(`Automatisation « ${automation.nom} » en échec :`, erreur);
    await prisma.automationRun.update({ where: { id: executionId }, data: { statut: "ECHEC", detail: message } });
    await journaliser({
      action: "automation.failed",
      summary: `Automatisation « ${automation.nom} » en échec : ${message}`,
      entityType: "Automation",
      entityId: automation.id,
    });
  }
  return "traite";
}

/// Reconstitue le cas d'une exécution passée, à partir de ce qu'elle a
/// enregistré (type et identifiant de l'entité, clé d'unicité).
async function casDepuisExecution(run: { cleUnicite: string; entityType: string; entityId: string }): Promise<Cas | { erreur: string }> {
  const base = { cle: run.cleUnicite, entityType: run.entityType, entityId: run.entityId };
  if (run.entityType === "TrainingSession" || run.entityType === "SessionLearner") {
    const [sessionId, learnerId] = run.entityId.split(":");
    const session = await prisma.trainingSession.findFirst({
      where: { id: sessionId, deletedAt: null },
      select: { companyId: true, deroulementSuspenduAt: true },
    });
    if (!session) return { erreur: "La session n'existe plus." };
    if (session.deroulementSuspenduAt) return { erreur: "Le déroulement de cette session est suspendu : reprenez-le d'abord." };
    return { ...base, sessionId, learnerId, companyId: session.companyId ?? undefined };
  }
  if (run.entityType === "Learner") {
    const apprenant = await prisma.learner.findFirst({ where: { id: run.entityId, deletedAt: null }, select: { companyId: true } });
    if (!apprenant) return { erreur: "L'apprenant n'existe plus." };
    return { ...base, learnerId: run.entityId, companyId: apprenant.companyId ?? undefined };
  }
  if (run.entityType === "Prospect") {
    const prospect = await prisma.prospect.findFirst({ where: { id: run.entityId, deletedAt: null }, select: { companyId: true } });
    if (!prospect) return { erreur: "Le prospect n'existe plus." };
    return { ...base, prospectId: run.entityId, companyId: prospect.companyId ?? undefined };
  }
  if (run.entityType === "Automation") return base;
  return { erreur: "Ce cas ne peut pas être relancé." };
}

/// Relance un cas en échec, une fois sa cause corrigée (prix de la session
/// saisi, Henrri de nouveau joignable, informations de l'organisme
/// complétées…). La trace d'échec est retirée et le cas retraité sous la même
/// clé. Ce qui avait abouti avant l'échec ne se refait pas : une facture déjà
/// émise bloque toute nouvelle émission, un destinataire déjà servi ne
/// reçoit rien de plus, un document inchangé ne change pas de version.
export async function relancerExecution(executionId: string): Promise<{ erreur?: string; detail?: string }> {
  const execution = await prisma.automationRun.findUnique({ where: { id: executionId }, include: { automation: true } });
  if (!execution) return { erreur: "Exécution introuvable." };
  if (execution.statut !== "ECHEC") return { erreur: "Seule une exécution en échec peut être relancée." };
  const cas = await casDepuisExecution(execution);
  if ("erreur" in cas) return { erreur: cas.erreur };

  await prisma.automationRun.delete({ where: { id: execution.id } });
  await traiterCas(execution.automation, cas);
  const nouvelle = await prisma.automationRun.findUnique({ where: { cleUnicite: execution.cleUnicite } });
  return {
    detail: `« ${execution.automation.nom} » : ${nouvelle?.statut === "ECHEC" ? "nouvel échec" : "réussie"} — ${nouvelle?.detail ?? "aucun détail"}`,
  };
}

async function automationsActives(declencheur: DeclencheurAutomatisation) {
  return prisma.automation.findMany({ where: { actif: true, declencheur } });
}

// ---------------------------------------------------------------------------
// Déclencheurs par événement
// ---------------------------------------------------------------------------

type Evenement =
  | { type: "APPRENANT_CREE"; learnerId: string }
  | { type: "INSCRIPTION_SESSION"; sessionId: string; learnerId: string }
  | { type: "SESSION_TERMINEE"; sessionId: string };

/// À appeler après une action métier. Ne lève jamais d'exception : une
/// automatisation en échec est tracée, mais n'annule pas l'action qui l'a
/// déclenchée.
export async function declencher(evenement: Evenement): Promise<void> {
  try {
    if ("sessionId" in evenement) {
      const session = await prisma.trainingSession.findUnique({
        where: { id: evenement.sessionId },
        select: { deroulementSuspenduAt: true },
      });
      // Alerte du client : la session ne déclenche plus rien. Une session
      // terminée pendant la suspension retrouve ses suites à la reprise.
      if (session?.deroulementSuspenduAt) return;
    }
    for (const automation of await automationsActives(evenement.type)) {
      if (evenement.type === "APPRENANT_CREE") {
        const apprenant = await prisma.learner.findUnique({ where: { id: evenement.learnerId } });
        await traiterCas(automation, {
          cle: `${automation.id}:apprenant:${evenement.learnerId}`,
          entityType: "Learner",
          entityId: evenement.learnerId,
          learnerId: evenement.learnerId,
          companyId: apprenant?.companyId ?? undefined,
        });
      }
      if (evenement.type === "INSCRIPTION_SESSION") {
        await traiterCas(automation, {
          cle: `${automation.id}:inscription:${evenement.sessionId}:${evenement.learnerId}`,
          entityType: "SessionLearner",
          entityId: `${evenement.sessionId}:${evenement.learnerId}`,
          learnerId: evenement.learnerId,
          sessionId: evenement.sessionId,
        });
      }
      if (evenement.type === "SESSION_TERMINEE") {
        const session = await prisma.trainingSession.findUnique({ where: { id: evenement.sessionId } });
        await traiterCas(automation, {
          cle: `${automation.id}:session:${evenement.sessionId}`,
          entityType: "TrainingSession",
          entityId: evenement.sessionId,
          sessionId: evenement.sessionId,
          companyId: session?.companyId ?? undefined,
        });
      }
    }
  } catch (erreur) {
    console.error("Déclenchement des automatisations impossible :", erreur);
  }
}

// ---------------------------------------------------------------------------
// Déclencheurs planifiés (réveil quotidien)
// ---------------------------------------------------------------------------

/// Statuts qui précèdent le début d'une session lancée (« Prête » et « En
/// attente de documents » ne se choisissent plus, mais peuvent subsister).
const STATUTS_LANCES = ["A_PREPARER", "DOCUMENTS_EN_ATTENTE", "PRETE"] as const;

/// Le calendrier fait avancer les sessions lancées, sans intervention :
/// « En cours » dès le premier jour, « Terminée » le lendemain du dernier.
/// C'est ce passage à « Terminée » qui déclenche les suites de fin de session
/// (facture). Une session en brouillon, annulée ou suspendue ne bouge pas.
async function avancerSessions(aujourdhui: Date): Promise<number> {
  const aTerminer = await prisma.trainingSession.findMany({
    where: { ...SESSIONS_EN_ROUTE, statut: { in: [...STATUTS_LANCES, "EN_COURS"] }, dateFin: { lt: aujourdhui } },
    select: { id: true },
  });
  for (const session of aTerminer) {
    await appliquerStatutSession(session.id, "TERMINEE");
    await declencher({ type: "SESSION_TERMINEE", sessionId: session.id });
  }
  const aDemarrer = await prisma.trainingSession.findMany({
    where: { ...SESSIONS_EN_ROUTE, statut: { in: [...STATUTS_LANCES] }, dateDebut: { lte: aujourdhui }, dateFin: { gte: aujourdhui } },
    select: { id: true },
  });
  for (const session of aDemarrer) await appliquerStatutSession(session.id, "EN_COURS");
  return aTerminer.length + aDemarrer.length;
}

/// Traite tous les cas planifiés dus. Peut être lancé plusieurs fois par jour
/// sans risque : les cas déjà traités sont reconnus et ignorés.
export async function executerPlanifiees(): Promise<{ traites: number; dejaTraites: number; sessionsAvancees: number }> {
  const bilan = { traites: 0, dejaTraites: 0, sessionsAvancees: 0 };
  const compter = (r: "traite" | "deja") => (r === "traite" ? bilan.traites++ : bilan.dejaTraites++);
  const aujourdhui = aujourdhuiUTC();

  bilan.sessionsAvancees = await avancerSessions(aujourdhui);

  for (const automation of await automationsActives("SESSION_AVANT_DEBUT")) {
    const { jours = 2, heure } = lireRegle(automation).parametres;
    // Toute session démarrant d'ici « jours » jours : si le réveil a manqué une
    // journée, le rappel part quand même, avec un jour d'avance en moins.
    const sessions = await prisma.trainingSession.findMany({
      where: {
        ...SESSIONS_EN_ROUTE,
        statut: { notIn: ["ANNULEE", "CLOTUREE", "BROUILLON"] },
        dateDebut: { gte: aujourdhui, lte: ajouterJours(aujourdhui, jours) },
      },
    });
    for (const session of sessions) {
      if (avantLHeure(ajouterJours(session.dateDebut, -jours), heure)) continue;
      compter(
        await traiterCas(automation, {
          // La date et la liste des inscrits font partie de la clé : une
          // session reportée déclenche un nouveau rappel pour ses nouvelles
          // dates, et une inscription tardive rouvre le cas pour le nouvel
          // arrivant (les autres sont protégés du doublon, voir plus bas).
          cle: `${automation.id}:session:${session.id}:${session.dateDebut.toISOString().slice(0, 10)}:${await empreinteInscrits(session.id)}`,
          entityType: "TrainingSession",
          entityId: session.id,
          sessionId: session.id,
          companyId: session.companyId ?? undefined,
        }),
      );
    }
  }

  for (const automation of await automationsActives("SESSION_AVANT_FIN")) {
    const { jours = 0, heure } = lireRegle(automation).parametres;
    // 0 jour = le dernier jour de la session lui-même.
    const sessions = await prisma.trainingSession.findMany({
      where: {
        ...SESSIONS_EN_ROUTE,
        statut: { notIn: ["ANNULEE", "BROUILLON"] },
        dateFin: { gte: aujourdhui, lte: ajouterJours(aujourdhui, jours) },
      },
    });
    for (const session of sessions) {
      if (avantLHeure(ajouterJours(session.dateFin, -jours), heure)) continue;
      compter(
        await traiterCas(automation, {
          cle: `${automation.id}:session:${session.id}:${session.dateFin.toISOString().slice(0, 10)}:${await empreinteInscrits(session.id)}`,
          entityType: "TrainingSession",
          entityId: session.id,
          sessionId: session.id,
          companyId: session.companyId ?? undefined,
        }),
      );
    }
  }

  // Campagnes annuelles : une date fixe dans l'année, et une heure à partir
  // de laquelle l'envoi est autorisé. Le réveil quotidien ne connaît que le
  // jour ; cette heure garantit qu'une campagne ne part pas au milieu de la
  // nuit si le réveil tourne plusieurs fois par jour.
  for (const automation of await automationsActives("CAMPAGNE_ANNUELLE")) {
    const { jour, mois, heure } = lireRegle(automation).parametres;
    if (!jour || !mois) continue;

    const maintenant = new Date();
    const annee = maintenant.getUTCFullYear();
    const dateCampagne = new Date(Date.UTC(annee, mois - 1, jour));
    // Pas encore la date de cette année : rien à faire.
    if (aujourdhui < dateCampagne) continue;
    // Le jour même, on attend l'heure dite (heure de Paris, celle du client).
    if (aujourdhui.getTime() === dateCampagne.getTime() && heureDeParis(maintenant) < (heure ?? 0)) continue;
    // Une campagne dont la date est passée avant l'activation n'est pas
    // rattrapée : même règle que pour les déclencheurs « après la fin ».
    if (automation.activeeAt && dateCampagne < automation.activeeAt) continue;

    compter(
      await traiterCas(automation, {
        // Une campagne par an : la clé porte l'année, rien d'autre.
        cle: `${automation.id}:campagne:${annee}`,
        entityType: "Automation",
        entityId: automation.id,
      }),
    );
  }

  for (const automation of await automationsActives("SESSION_APRES_FIN")) {
    const { jours = 1, heure } = lireRegle(automation).parametres;
    // Pas de borne dans le passé, mais une borne à l'activation : le moment
    // du déclenchement (fin de session + N jours) doit tomber après
    // l'allumage de l'automatisation. Une session dont l'échéance est déjà
    // passée quand on active n'est donc jamais rattrapée — c'est ce qui
    // évite une rafale d'envois le jour où un historique est importé. Une
    // session terminée récemment, dont l'échéance est encore à venir, reste
    // servie au bon moment.
    const finMinimale = automation.activeeAt ? ajouterJours(automation.activeeAt, -jours) : null;
    const sessions = await prisma.trainingSession.findMany({
      where: {
        ...SESSIONS_EN_ROUTE,
        statut: { notIn: ["ANNULEE", "BROUILLON"] },
        dateFin: { lte: ajouterJours(aujourdhui, -jours), ...(finMinimale ? { gte: finMinimale } : {}) },
      },
    });
    for (const session of sessions) {
      if (avantLHeure(ajouterJours(session.dateFin, jours), heure)) continue;
      compter(
        await traiterCas(automation, {
          cle: `${automation.id}:session:${session.id}:${await empreinteInscrits(session.id)}:${await empreinteEvaluations(session.id)}`,
          entityType: "TrainingSession",
          entityId: session.id,
          sessionId: session.id,
          companyId: session.companyId ?? undefined,
        }),
      );
    }
  }

  // Chaque jour de session, du premier au dernier : un cas par session et par
  // jour (feuille d'émargement du jour envoyée au formateur).
  for (const automation of await automationsActives("SESSION_JOUR")) {
    if (avantLHeure(aujourdhui, lireRegle(automation).parametres.heure)) continue;
    const sessions = await prisma.trainingSession.findMany({
      where: {
        ...SESSIONS_EN_ROUTE,
        statut: { notIn: ["ANNULEE", "CLOTUREE", "BROUILLON"] },
        dateDebut: { lte: aujourdhui },
        dateFin: { gte: aujourdhui },
      },
    });
    for (const session of sessions) {
      compter(
        await traiterCas(automation, {
          cle: `${automation.id}:session:${session.id}:jour:${aujourdhui.toISOString().slice(0, 10)}`,
          entityType: "TrainingSession",
          entityId: session.id,
          sessionId: session.id,
          companyId: session.companyId ?? undefined,
        }),
      );
    }
  }

  for (const automation of await automationsActives("RELANCE_PROSPECT_DUE")) {
    const prospects = await prisma.prospect.findMany({
      where: {
        deletedAt: null,
        statut: { notIn: ["GAGNE", "PERDU"] },
        prochaineRelanceAt: { lte: ajouterJours(aujourdhui, 1) },
      },
    });
    for (const prospect of prospects) {
      compter(
        await traiterCas(automation, {
          // Une nouvelle date de relance produit une nouvelle tâche.
          cle: `${automation.id}:prospect:${prospect.id}:${prospect.prochaineRelanceAt!.toISOString().slice(0, 10)}`,
          entityType: "Prospect",
          entityId: prospect.id,
          prospectId: prospect.id,
          companyId: prospect.companyId ?? undefined,
        }),
      );
    }
  }

  return bilan;
}
