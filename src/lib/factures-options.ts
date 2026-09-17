import "server-only";

import { prisma } from "@/lib/prisma";
import { formaterPeriode } from "@/lib/sessions-libelles";

/// Listes proposées dans le formulaire de facture.
export async function optionsFacture() {
  const [sessions, entreprises, apprenants] = await Promise.all([
    prisma.trainingSession.findMany({
      where: { deletedAt: null, statut: { not: "ANNULEE" } },
      orderBy: { dateDebut: "desc" },
      take: 200,
      select: { id: true, numero: true, dateDebut: true, dateFin: true, formation: { select: { titre: true } } },
    }),
    prisma.company.findMany({ where: { deletedAt: null }, orderBy: { raisonSociale: "asc" }, select: { id: true, raisonSociale: true } }),
    prisma.learner.findMany({ where: { deletedAt: null }, orderBy: [{ nom: "asc" }, { prenom: "asc" }], select: { id: true, nom: true, prenom: true } }),
  ]);
  return {
    sessions: sessions.map((s) => ({ id: s.id, libelle: `${s.numero} — ${s.formation.titre} (${formaterPeriode(s.dateDebut, s.dateFin)})` })),
    entreprises: entreprises.map((e) => ({ id: e.id, libelle: e.raisonSociale })),
    apprenants: apprenants.map((a) => ({ id: a.id, libelle: `${a.nom} ${a.prenom}` })),
  };
}
