import "server-only";

import { joursDeSession } from "@/lib/emargement";
import { libelleJour } from "@/lib/emargement-feuilles";
import { prisma } from "@/lib/prisma";
import { aujourdhuiUTC } from "@/lib/sessions-libelles";

/// Réalisation prouvée d'une session (demande du client du 30/09/2026) : ce
/// sont ces documents qui déclenchent la facture. Il faut, une fois le
/// dernier jour arrivé :
/// - une feuille d'émargement signée pour chaque jour de formation ;
/// - l'attestation et le certificat de réalisation de chaque inscrit (ils
///   supposent l'évaluation des acquis transmise par le formateur).
/// Renvoie ce qui manque encore (liste vide : réalisation prouvée), ou null
/// si la session n'en est pas là (pas finie, brouillon, annulée).
export async function manquesRealisation(sessionId: string): Promise<string[] | null> {
  const session = await prisma.trainingSession.findFirst({
    where: { id: sessionId, deletedAt: null },
    select: {
      statut: true,
      dateDebut: true,
      dateFin: true,
      feuillesSignees: { select: { jour: true } },
      inscriptions: {
        where: { learner: { deletedAt: null } },
        select: { learner: { select: { id: true, prenom: true, nom: true } } },
      },
      documents: {
        where: { deletedAt: null, learnerId: { not: null }, type: { code: { in: ["ATTESTATION", "CERTIFICAT"] } } },
        select: { learnerId: true, type: { select: { code: true } } },
      },
    },
  });
  if (!session || session.statut === "BROUILLON" || session.statut === "ANNULEE") return null;
  if (session.dateFin > aujourdhuiUTC() || session.inscriptions.length === 0) return null;

  const manques: string[] = [];
  const signees = new Set(session.feuillesSignees.map((f) => f.jour.getTime()));
  const jours = joursDeSession(session.dateDebut, session.dateFin).filter((j) => !signees.has(j.getTime()));
  if (jours.length > 0) manques.push(`feuille d'émargement signée du ${jours.map(libelleJour).join(", ")}`);
  for (const { learner } of session.inscriptions) {
    const siens = new Set(session.documents.filter((d) => d.learnerId === learner.id).map((d) => d.type?.code));
    const absents = [!siens.has("ATTESTATION") && "attestation", !siens.has("CERTIFICAT") && "certificat"].filter(Boolean);
    if (absents.length > 0) manques.push(`${absents.join(" et ")} de ${learner.prenom} ${learner.nom}`);
  }
  return manques;
}
