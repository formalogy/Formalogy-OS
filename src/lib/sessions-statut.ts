import "server-only";

import type { StatutSession } from "@prisma/client";

import { journaliser } from "@/lib/journal";
import { prisma } from "@/lib/prisma";
import { LIBELLE_STATUT_SESSION } from "@/lib/sessions-libelles";

/// Change le statut d'une session et répercute l'avancement sur les apprenants :
/// une session qui démarre fait passer ses inscrits « en formation » ; une
/// session terminée les fait passer « terminé », sauf s'ils suivent encore une
/// autre session en cours.
///
/// Partagé entre le changement manuel (fiche session) et la bascule
/// automatique du réveil quotidien (`userId` absent). Renvoie `acheve` quand la
/// session vient de passer « Terminée » ou « Clôturée » : à l'appelant d'en
/// déclencher alors les suites (facture…).
export async function appliquerStatutSession(
  sessionId: string,
  statut: StatutSession,
  userId?: string,
): Promise<{ acheve: boolean }> {
  const session = await prisma.trainingSession.update({
    where: { id: sessionId },
    data: { statut },
    include: { inscriptions: { select: { learnerId: true } } },
  });
  const ids = session.inscriptions.map((i) => i.learnerId);
  let apprenantsMisAJour = 0;

  if (statut === "EN_COURS" && ids.length) {
    const r = await prisma.learner.updateMany({
      where: { id: { in: ids }, statut: { in: ["PROSPECT", "INSCRIT"] } },
      data: { statut: "EN_FORMATION" },
    });
    apprenantsMisAJour = r.count;
  }

  const acheve = statut === "TERMINEE" || statut === "CLOTUREE";
  if (acheve && ids.length) {
    // Un apprenant qui suit encore une autre session non achevée n'a pas
    // terminé son parcours : on ne le passe pas « terminé ».
    const autresSessionsEnCours = await prisma.sessionLearner.findMany({
      where: {
        learnerId: { in: ids },
        sessionId: { not: sessionId },
        session: { deletedAt: null, statut: { notIn: ["TERMINEE", "CLOTUREE", "ANNULEE"] } },
      },
      select: { learnerId: true },
    });
    const exclus = new Set(autresSessionsEnCours.map((i) => i.learnerId));
    // Une session peut passer directement de « Prête » à « Terminée » sans que
    // son statut ait été mis « En cours » : ses inscrits sont alors encore
    // « Inscrit », et doivent aussi passer « Terminé ».
    const r = await prisma.learner.updateMany({
      where: {
        id: { in: ids.filter((id) => !exclus.has(id)) },
        statut: { in: ["PROSPECT", "INSCRIT", "EN_FORMATION"] },
      },
      data: { statut: "TERMINE" },
    });
    apprenantsMisAJour = r.count;
  }

  await journaliser({
    action: "session.status_changed",
    summary:
      `Session ${session.numero} — statut passé ${userId ? "" : "automatiquement "}à « ${LIBELLE_STATUT_SESSION[statut]} »` +
      (apprenantsMisAJour
        ? ` (${apprenantsMisAJour} apprenant${apprenantsMisAJour > 1 ? "s" : ""} mis à jour)`
        : ""),
    entityType: "TrainingSession",
    entityId: session.id,
    userId,
  });
  return { acheve };
}
