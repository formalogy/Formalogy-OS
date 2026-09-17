import "server-only";

import { formateurDuCompte } from "@/lib/formateurs";
import { prisma } from "@/lib/prisma";
import type { UtilisateurConnecte } from "@/lib/session";

/// Session dont l'utilisateur peut consulter et saisir l'émargement :
/// toutes pour l'équipe, uniquement les siennes (hors brouillon) pour un
/// formateur. Renvoie null sinon — même réponse que pour une session inexistante.
export async function sessionPourEmargement(utilisateur: UtilisateurConnecte, sessionId: string) {
  let filtreFormateur = {};
  if (utilisateur.role === "FORMATEUR") {
    const formateur = await formateurDuCompte(utilisateur.id);
    if (!formateur) return null;
    filtreFormateur = { trainerId: formateur.id, statut: { not: "BROUILLON" as const } };
  } else if (utilisateur.role !== "ADMIN" && utilisateur.role !== "GESTIONNAIRE") {
    return null;
  }

  return prisma.trainingSession.findFirst({
    where: { id: sessionId, deletedAt: null, ...filtreFormateur },
    select: {
      id: true,
      numero: true,
      dateDebut: true,
      dateFin: true,
      horaires: true,
      lieu: true,
      statut: true,
      formation: { select: { titre: true } },
      company: { select: { raisonSociale: true } },
      trainer: { select: { prenom: true, nom: true } },
      inscriptions: {
        where: { learner: { deletedAt: null } },
        orderBy: [{ learner: { nom: "asc" } }, { learner: { prenom: "asc" } }],
        select: { learner: { select: { id: true, prenom: true, nom: true, company: { select: { raisonSociale: true } } } } },
      },
      presences: { select: { learnerId: true, jour: true, creneau: true, statut: true } },
    },
  });
}
