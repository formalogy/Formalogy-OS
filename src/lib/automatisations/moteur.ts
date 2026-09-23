import "server-only";

import { createHash } from "node:crypto";

import type { Automation, DeclencheurAutomatisation, TypeFinancement } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { genererConvention } from "@/lib/conventions";
import { construireContexte } from "@/lib/emails/contexte";
import { envoyerEmail, type PieceJointe } from "@/lib/emails/envoi";
import { rendre } from "@/lib/emails/modeles";
import { genererDocumentsFinDeFormation } from "@/lib/fin-de-formation";
import { genererFactureHenrriPourSession } from "@/lib/henrri/facturation";
import { journaliser } from "@/lib/journal";
import { preparerLienQuestionnaireQualite } from "@/lib/questionnaires";
import { prisma } from "@/lib/prisma";
import { preparerLienQuestionnaire } from "@/lib/satisfaction";
import { ajouterJours, aujourdhuiUTC } from "@/lib/sessions-libelles";
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
    /// APPRENANT : l'apprenant concerné ; APPRENANTS_SESSION : tous les inscrits
    destinataires: z.enum(["APPRENANT", "APPRENANTS_SESSION"]),
    /// Documents joints à l'email. CONVENTION fabrique la convention de
    /// l'apprenant à partir du modèle déposé, la range dans les documents de
    /// la session et l'attache. ATTESTATION et CERTIFICAT reprennent les
    /// documents déjà produits pour cet apprenant : si l'un manque — présences
    /// ou évaluation incomplètes — il est simplement omis.
    joindre: z.array(z.enum(["CONVENTION", "ATTESTATION", "CERTIFICAT"])).optional(),
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

  const comptes = { emails: 0, simules: 0, sansAdresse: 0, ignores: 0, dejaServis: 0, taches: 0, factures: 0, documents: 0, conventions: 0, documentsAbsents: 0 };
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

          // Pièces jointes demandées par l'action. Une convention qui ne peut
          // pas être fabriquée (modèle absent) n'empêche pas l'email de
          // partir : le message reste utile, le document se dépose à la main.
          const piecesJointes: PieceJointe[] = [];
          for (const typeCode of ["ATTESTATION", "CERTIFICAT"] as const) {
            if (!action.joindre?.includes(typeCode) || !cas.sessionId) continue;
            const piece = await pieceJointeDocument(typeCode, cas.sessionId, apprenant.id);
            if (piece) piecesJointes.push(piece);
            else comptes.documentsAbsents++;
          }
          if (action.joindre?.includes("CONVENTION") && cas.sessionId) {
            const convention = await genererConvention({ sessionId: cas.sessionId, learnerId: apprenant.id });
            if ("erreur" in convention) conventionsEchouees.add(convention.erreur);
            else {
              piecesJointes.push({ nom: convention.fichier.nom, contenu: convention.fichier.octets, typeMime: convention.fichier.typeMime });
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
      comptes.conventions && `${comptes.conventions} convention(s) jointe(s)`,
      comptes.documentsAbsents && `${comptes.documentsAbsents} document(s) attendu(s) mais absent(s)`,
      conventionsEchouees.size > 0 && `convention non générée — ${[...conventionsEchouees].join(" ; ")}`,
      comptes.dejaServis && `${comptes.dejaServis} apprenant(s) déjà destinataires`,
      comptes.sansAdresse && `${comptes.sansAdresse} apprenant(s) sans adresse email`,
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

/// Traite tous les cas planifiés dus. Peut être lancé plusieurs fois par jour
/// sans risque : les cas déjà traités sont reconnus et ignorés.
export async function executerPlanifiees(): Promise<{ traites: number; dejaTraites: number }> {
  const bilan = { traites: 0, dejaTraites: 0 };
  const compter = (r: "traite" | "deja") => (r === "traite" ? bilan.traites++ : bilan.dejaTraites++);
  const aujourdhui = aujourdhuiUTC();

  for (const automation of await automationsActives("SESSION_AVANT_DEBUT")) {
    const jours = lireRegle(automation).parametres.jours ?? 2;
    // Toute session démarrant d'ici « jours » jours : si le réveil a manqué une
    // journée, le rappel part quand même, avec un jour d'avance en moins.
    const sessions = await prisma.trainingSession.findMany({
      where: {
        deletedAt: null,
        statut: { notIn: ["ANNULEE", "CLOTUREE", "BROUILLON"] },
        dateDebut: { gte: aujourdhui, lte: ajouterJours(aujourdhui, jours) },
      },
    });
    for (const session of sessions) {
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
    const jours = lireRegle(automation).parametres.jours ?? 0;
    // 0 jour = le dernier jour de la session lui-même.
    const sessions = await prisma.trainingSession.findMany({
      where: {
        deletedAt: null,
        statut: { notIn: ["ANNULEE", "BROUILLON"] },
        dateFin: { gte: aujourdhui, lte: ajouterJours(aujourdhui, jours) },
      },
    });
    for (const session of sessions) {
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

  for (const automation of await automationsActives("SESSION_APRES_FIN")) {
    const jours = lireRegle(automation).parametres.jours ?? 1;
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
        deletedAt: null,
        statut: { notIn: ["ANNULEE", "BROUILLON"] },
        dateFin: { lte: ajouterJours(aujourdhui, -jours), ...(finMinimale ? { gte: finMinimale } : {}) },
      },
    });
    for (const session of sessions) {
      compter(
        await traiterCas(automation, {
          cle: `${automation.id}:session:${session.id}:${await empreinteInscrits(session.id)}`,
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
