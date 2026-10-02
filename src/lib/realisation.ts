import "server-only";

import { joursDeSession } from "@/lib/emargement";
import { libelleJour } from "@/lib/emargement-feuilles";
import { modaliteEnLigne } from "@/lib/formations-libelles";
import { prisma } from "@/lib/prisma";
import { aujourdhuiUTC } from "@/lib/sessions-libelles";

/// Réalisation prouvée d'une session (demande du client du 30/09/2026) : ce
/// sont ces documents qui déclenchent la facture. Il faut, une fois le
/// dernier jour arrivé :
/// - une feuille d'émargement signée pour chaque jour de formation (en
///   ligne : la fin du parcours de chaque inscrit, voir plus bas) ;
/// - l'attestation et le certificat de réalisation de chaque inscrit (ils
///   supposent l'évaluation des acquis transmise par le formateur).
/// Renvoie ce qui manque encore (liste vide : réalisation prouvée), ou null
/// si la session n'en est pas là (pas finie, brouillon, annulée).
export async function manquesRealisation(sessionId: string): Promise<string[] | null> {
  const session = await prisma.trainingSession.findFirst({
    where: { id: sessionId, deletedAt: null },
    select: {
      statut: true,
      modalite: true,
      dateDebut: true,
      dateFin: true,
      feuillesSignees: { select: { jour: true } },
      inscriptions: {
        where: { learner: { deletedAt: null } },
        select: { parcoursTermineLe: true, learner: { select: { id: true, prenom: true, nom: true } } },
      },
      documents: {
        where: { deletedAt: null, learnerId: { not: null }, type: { code: { in: ["ATTESTATION", "CERTIFICAT"] } } },
        select: { learnerId: true, type: { select: { code: true } } },
      },
    },
  });
  if (!session || session.statut === "BROUILLON" || session.statut === "ANNULEE") return null;
  if (session.inscriptions.length === 0) return null;
  const enLigne = modaliteEnLigne(session.modalite);

  const manques: string[] = [];
  if (enLigne) {
    // En ligne : pas d'émargement ; la preuve est la fin du parcours de
    // chacun (100 % sur la plateforme), validée sur la session. La facture
    // peut partir avant la date de fin si tous ont terminé.
    if (!session.inscriptions.some((i) => i.parcoursTermineLe) && session.dateFin > aujourdhuiUTC()) return null;
    for (const i of session.inscriptions) {
      if (!i.parcoursTermineLe) manques.push(`fin du parcours en ligne de ${i.learner.prenom} ${i.learner.nom}`);
    }
  } else {
    if (session.dateFin > aujourdhuiUTC()) return null;
    const signees = new Set(session.feuillesSignees.map((f) => f.jour.getTime()));
    const jours = joursDeSession(session.dateDebut, session.dateFin).filter((j) => !signees.has(j.getTime()));
    if (jours.length > 0) manques.push(`feuille d'émargement signée du ${jours.map(libelleJour).join(", ")}`);
  }
  for (const { learner } of session.inscriptions) {
    const siens = new Set(session.documents.filter((d) => d.learnerId === learner.id).map((d) => d.type?.code));
    const absents = [!siens.has("ATTESTATION") && "attestation", !siens.has("CERTIFICAT") && "certificat"].filter(Boolean);
    if (absents.length > 0) manques.push(`${absents.join(" et ")} de ${learner.prenom} ${learner.nom}`);
  }
  return manques;
}
