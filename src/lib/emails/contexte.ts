import "server-only";

import type { Contexte } from "@/lib/emails/modeles";
import { LIBELLE_MODALITE } from "@/lib/formations-libelles";
import { prisma } from "@/lib/prisma";
import { formaterPeriode } from "@/lib/sessions-libelles";

export function nomOrganisme(): string {
  return process.env.ORGANISME_NOM || "Formalogy";
}

/// Rassemble les valeurs des variables à partir des fiches concernées.
export async function construireContexte(ids: {
  learnerId?: string;
  sessionId?: string;
  companyId?: string;
  prospectId?: string;
}): Promise<Contexte> {
  const [apprenant, session, entreprise, prospect] = await Promise.all([
    ids.learnerId ? prisma.learner.findUnique({ where: { id: ids.learnerId } }) : null,
    ids.sessionId
      ? prisma.trainingSession.findUnique({
          where: { id: ids.sessionId },
          include: { formation: { select: { titre: true } }, company: { select: { raisonSociale: true } } },
        })
      : null,
    ids.companyId ? prisma.company.findUnique({ where: { id: ids.companyId } }) : null,
    ids.prospectId ? prisma.prospect.findUnique({ where: { id: ids.prospectId } }) : null,
  ]);

  return {
    "organisme.nom": nomOrganisme(),
    "apprenant.prenom": apprenant?.prenom,
    "apprenant.nom": apprenant?.nom,
    "session.numero": session?.numero,
    "session.formation": session?.formation.titre,
    "session.dates": session ? formaterPeriode(session.dateDebut, session.dateFin) : undefined,
    "session.horaires": session?.horaires,
    "session.lieu": session?.lieu,
    "session.modalite": session ? LIBELLE_MODALITE[session.modalite] : undefined,
    "entreprise.nom": entreprise?.raisonSociale ?? session?.company?.raisonSociale,
    "prospect.nomComplet": prospect ? `${prospect.prenom} ${prospect.nom}` : undefined,
  };
}
