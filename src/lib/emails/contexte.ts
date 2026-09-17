import "server-only";

import type { Contexte } from "@/lib/emails/modeles";
import { LIBELLE_MODALITE } from "@/lib/formations-libelles";
import { lireOrganisme } from "@/lib/organisme";
import { prisma } from "@/lib/prisma";
import { formaterPeriode } from "@/lib/sessions-libelles";


/// Rassemble les valeurs des variables à partir des fiches concernées.
export async function construireContexte(ids: {
  learnerId?: string;
  sessionId?: string;
  companyId?: string;
  prospectId?: string;
  dossierId?: string;
  lienQuestionnaire?: string;
}): Promise<Contexte> {
  const [organisme, apprenant, session, entreprise, prospect, dossier] = await Promise.all([
    lireOrganisme(),
    ids.learnerId ? prisma.learner.findUnique({ where: { id: ids.learnerId } }) : null,
    ids.sessionId
      ? prisma.trainingSession.findUnique({
          where: { id: ids.sessionId },
          include: {
            formation: { select: { titre: true } },
            company: { select: { raisonSociale: true } },
            trainer: { select: { prenom: true, nom: true } },
          },
        })
      : null,
    ids.companyId ? prisma.company.findUnique({ where: { id: ids.companyId } }) : null,
    ids.prospectId ? prisma.prospect.findUnique({ where: { id: ids.prospectId } }) : null,
    ids.dossierId ? prisma.dossierFinancement.findUnique({ where: { id: ids.dossierId } }) : null,
  ]);

  return {
    "organisme.nom": organisme.raisonSociale,
    "apprenant.prenom": apprenant?.prenom,
    "apprenant.nom": apprenant?.nom,
    "session.numero": session?.numero,
    "session.formation": session?.formation.titre,
    "session.dates": session ? formaterPeriode(session.dateDebut, session.dateFin) : undefined,
    "session.horaires": session?.horaires,
    "session.lieu": session?.lieu,
    "session.modalite": session ? LIBELLE_MODALITE[session.modalite] : undefined,
    "session.formateur": session?.trainer ? `${session.trainer.prenom} ${session.trainer.nom}` : undefined,
    "entreprise.nom": entreprise?.raisonSociale ?? session?.company?.raisonSociale,
    "prospect.nomComplet": prospect ? `${prospect.prenom} ${prospect.nom}` : undefined,
    "dossier.financeur": dossier?.financeurNom,
    "dossier.reference": dossier?.reference,
    "questionnaire.lien": ids.lienQuestionnaire,
  };
}
