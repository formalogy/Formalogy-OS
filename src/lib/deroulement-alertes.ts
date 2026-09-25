import "server-only";

import { prisma } from "@/lib/prisma";
import { ajouterJours, aujourdhuiUTC } from "@/lib/sessions-libelles";

/// Un point qui empêche le déroulement automatique d'aller au bout : le seul
/// moment où le client doit intervenir (décision du 25/09/2026).
export type AlerteDeroulement = {
  /// « bloquant » : quelque chose ne partira pas sans intervention ;
  /// « attente » : le déroulement attend, sans que rien ne soit encore perdu.
  niveau: "bloquant" | "attente";
  texte: string;
  lien: string;
};

const jour = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Paris" });

/// Au-delà, une session achevée ne fait plus l'objet d'alertes.
const JOURS_DE_SUIVI = 90;

/// Tout ce qui bloque ou retient le déroulement automatique des sessions
/// lancées, du plus grave au moins grave.
export async function alertesDeroulement(): Promise<AlerteDeroulement[]> {
  const aujourdhui = aujourdhuiUTC();
  const sessions = await prisma.trainingSession.findMany({
    where: {
      deletedAt: null,
      statut: { notIn: ["BROUILLON", "ANNULEE"] },
      dateFin: { gte: ajouterJours(aujourdhui, -JOURS_DE_SUIVI) },
    },
    orderBy: { dateDebut: "asc" },
    select: {
      id: true,
      numero: true,
      statut: true,
      dateFin: true,
      deroulementSuspenduAt: true,
      trainer: { select: { prenom: true, nom: true, email: true } },
      inscriptions: { where: { learner: { deletedAt: null } }, select: { learner: { select: { id: true, email: true } } } },
      evaluations: { select: { learnerId: true } },
      factures: {
        where: { statut: { not: "ANNULEE" } },
        select: { id: true, numero: true, statut: true, documentId: true },
      },
      emails: {
        where: { statut: { not: "ECHEC" }, template: { code: "FACTURE" } },
        select: { id: true },
      },
    },
  });

  const alertes: AlerteDeroulement[] = [];
  for (const s of sessions) {
    const lien = `/sessions/${s.id}`;
    if (s.deroulementSuspenduAt) {
      alertes.push({ niveau: "attente", texte: `${s.numero} : déroulement suspendu depuis le ${jour.format(s.deroulementSuspenduAt)}.`, lien });
      continue;
    }
    const aVenirOuEnCours = s.dateFin >= aujourdhui;
    const achevee = s.dateFin < aujourdhui;

    if (aVenirOuEnCours) {
      if (!s.trainer) {
        alertes.push({ niveau: "bloquant", texte: `${s.numero} : aucun formateur affecté (feuilles d'émargement et évaluation des acquis sans destinataire).`, lien });
      } else if (!s.trainer.email) {
        alertes.push({ niveau: "bloquant", texte: `${s.numero} : le formateur ${s.trainer.prenom} ${s.trainer.nom} n'a pas d'adresse email.`, lien });
      }
      const sansAdresse = s.inscriptions.filter((i) => !i.learner.email).length;
      if (sansAdresse > 0) {
        alertes.push({ niveau: "bloquant", texte: `${s.numero} : ${sansAdresse} apprenant${sansAdresse > 1 ? "s" : ""} sans adresse email (aucun envoi possible).`, lien });
      }
    }

    if (achevee) {
      const evalues = new Set(s.evaluations.map((e) => e.learnerId));
      const attendues = s.inscriptions.filter((i) => !evalues.has(i.learner.id)).length;
      if (attendues > 0) {
        // Un jour de battement après la fin : le formateur répond souvent le soir même.
        const enRetard = s.dateFin < ajouterJours(aujourdhui, -2);
        alertes.push({
          niveau: enRetard ? "bloquant" : "attente",
          texte: `${s.numero} : évaluation des acquis attendue du formateur pour ${attendues} apprenant${attendues > 1 ? "s" : ""} — les attestations partiront à sa réception.`,
          lien: `/sessions/${s.id}/fin-de-formation`,
        });
      }

      const facture = s.factures.find((f) => f.numero);
      if (s.statut === "TERMINEE" || s.statut === "CLOTUREE") {
        if (!facture) {
          alertes.push({ niveau: "bloquant", texte: `${s.numero} : facture non émise.`, lien: "/factures" });
        } else if (!facture.documentId) {
          alertes.push({ niveau: "bloquant", texte: `${s.numero} : PDF de la facture ${facture.numero} non récupéré depuis Henrri.`, lien: `/factures/${facture.id}` });
        } else if (s.emails.length === 0) {
          alertes.push({ niveau: "bloquant", texte: `${s.numero} : facture ${facture.numero} non envoyée au payeur.`, lien: `/factures/${facture.id}` });
        }
      }
    }
  }

  // Automatisations en échec ces deux dernières semaines.
  const echecs = await prisma.automationRun.findMany({
    where: { statut: "ECHEC", createdAt: { gte: ajouterJours(aujourdhui, -14) } },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { detail: true, createdAt: true, automation: { select: { nom: true } } },
  });
  for (const e of echecs) {
    alertes.push({
      niveau: "bloquant",
      texte: `« ${e.automation.nom} » en échec le ${jour.format(e.createdAt)} : ${e.detail ?? "erreur inconnue"}`,
      lien: "/parametres/automatisations",
    });
  }

  return alertes.sort((a, b) => (a.niveau === b.niveau ? 0 : a.niveau === "bloquant" ? -1 : 1));
}
