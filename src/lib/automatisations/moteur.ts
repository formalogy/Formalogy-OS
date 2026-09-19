import "server-only";

import type { Automation, DeclencheurAutomatisation, TypeFinancement } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { construireContexte } from "@/lib/emails/contexte";
import { envoyerEmail } from "@/lib/emails/envoi";
import { rendre } from "@/lib/emails/modeles";
import { genererFactureHenrriPourSession } from "@/lib/henrri/facturation";
import { journaliser } from "@/lib/journal";
import { prisma } from "@/lib/prisma";
import { preparerLienQuestionnaire } from "@/lib/satisfaction";
import { ajouterJours, aujourdhuiUTC } from "@/lib/sessions-libelles";

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
]);
export type ActionAutomatisation = z.infer<typeof schemaAction>;

const schemaConditions = z.object({
  /// Ne traiter que les apprenants ayant l'un de ces financements
  financement: z.array(z.enum(["ENTREPRISE", "OPCO", "CPF", "FRANCE_TRAVAIL", "PERSONNEL", "AUTRE"])).optional(),
});

const schemaParametres = z.object({
  /// SESSION_AVANT_DEBUT : nombre de jours avant le début
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

  const comptes = { emails: 0, simules: 0, sansAdresse: 0, ignores: 0, taches: 0, factures: 0 };
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

        for (const apprenant of destinataires) {
          if (!accepte(apprenant.financement)) {
            comptes.ignores++;
            continue;
          }
          if (!apprenant.email) {
            comptes.sansAdresse++;
            continue;
          }
          // Modèle avec lien personnel vers le questionnaire : un lien par
          // apprenant, et rien à envoyer à qui a déjà répondu.
          let lienQuestionnaire: string | undefined;
          if (cas.sessionId && `${modele.sujet}${modele.corps}`.includes("questionnaire.lien")) {
            const lien = await preparerLienQuestionnaire(cas.sessionId, apprenant.id);
            if (!lien) {
              comptes.ignores++;
              continue;
            }
            lienQuestionnaire = lien;
          }
          const contexte = await construireContexte({
            learnerId: apprenant.id,
            sessionId: cas.sessionId,
            companyId: apprenant.companyId ?? cas.companyId,
            lienQuestionnaire,
          });
          const email = await envoyerEmail({
            destinataire: apprenant.email,
            sujet: rendre(modele.sujet, contexte).resultat,
            corps: rendre(modele.corps, contexte).resultat,
            corpsJournal: lienQuestionnaire
              ? rendre(modele.corps, { ...contexte, "questionnaire.lien": "[lien personnel masqué]" }).resultat
              : undefined,
            templateId: modele.id,
            learnerId: apprenant.id,
            sessionId: cas.sessionId,
            companyId: apprenant.companyId ?? undefined,
            automationRunId: executionId,
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
    }

    const parties = [
      comptes.emails && `${comptes.emails} email(s) envoyé(s)`,
      comptes.simules && `${comptes.simules} email(s) simulé(s)`,
      comptes.taches && `${comptes.taches} tâche(s) créée(s)`,
      comptes.factures && `${comptes.factures} facture(s) émise(s) via Henrri`,
      comptes.sansAdresse && `${comptes.sansAdresse} apprenant(s) sans adresse email`,
      comptes.ignores && `${comptes.ignores} apprenant(s) hors conditions`,
    ].filter(Boolean);
    const rienFait = comptes.emails + comptes.simules + comptes.taches + comptes.factures === 0;

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
          // La date fait partie de la clé : une session reportée déclenche un
          // nouveau rappel pour ses nouvelles dates.
          cle: `${automation.id}:session:${session.id}:${session.dateDebut.toISOString().slice(0, 10)}`,
          entityType: "TrainingSession",
          entityId: session.id,
          sessionId: session.id,
          companyId: session.companyId ?? undefined,
        }),
      );
    }
  }

  for (const automation of await automationsActives("DOSSIER_SANS_REPONSE")) {
    const jours = lireRegle(automation).parametres.jours ?? 15;
    const dossiers = await prisma.dossierFinancement.findMany({
      where: { statut: "DEPOSE", dateDepot: { lte: ajouterJours(aujourdhui, -jours) } },
    });
    for (const dossier of dossiers) {
      compter(
        await traiterCas(automation, {
          // Une seule relance par dossier et par date de dépôt : redéposer le
          // dossier en produit une nouvelle.
          cle: `${automation.id}:dossier:${dossier.id}:${dossier.dateDepot!.toISOString().slice(0, 10)}`,
          entityType: "DossierFinancement",
          entityId: dossier.id,
          dossierId: dossier.id,
          learnerId: dossier.learnerId ?? undefined,
          sessionId: dossier.sessionId ?? undefined,
          companyId: dossier.companyId ?? undefined,
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
