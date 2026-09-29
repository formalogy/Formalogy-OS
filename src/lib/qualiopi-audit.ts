import "server-only";

import { lireOrganisme } from "@/lib/organisme";
import { prisma } from "@/lib/prisma";

const dateLongue = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });

/// Où en est la préparation du prochain audit Qualiopi (automatisation A-13) :
/// indicateurs applicables conformes, et ceux à reprendre — non conformes, ou
/// conformes sans aucune preuve déposée (l'auditeur demandera la preuve).
export async function preparationAudit() {
  const [organisme, indicateurs] = await Promise.all([
    lireOrganisme(),
    prisma.indicateurQualiopi.findMany({
      orderBy: { numero: "asc" },
      select: { numero: true, intitule: true, applicable: true, statut: true, _count: { select: { preuves: { where: { deletedAt: null } } } } },
    }),
  ]);
  const applicables = indicateurs.filter((i) => i.applicable);
  const conformes = applicables.filter((i) => i.statut === "CONFORME").length;
  const aReprendre = applicables.filter((i) => i.statut !== "CONFORME" || i._count.preuves === 0);
  const raison = (i: (typeof applicables)[number]) =>
    i.statut !== "CONFORME" ? (i._count.preuves === 0 ? "non conforme, aucune preuve" : "non conforme") : "conforme, mais aucune preuve déposée";
  const intitule = (texte: string) => (texte.length > 110 ? `${texte.slice(0, 107).trimEnd()}…` : texte);

  return {
    dateAudit: organisme.qualiopiProchainAuditAt,
    dateAuditTexte: organisme.qualiopiProchainAuditAt ? dateLongue.format(organisme.qualiopiProchainAuditAt) : null,
    bilan: `${conformes} indicateur${conformes > 1 ? "s" : ""} conforme${conformes > 1 ? "s" : ""} sur ${applicables.length} applicables ; ${aReprendre.length} à reprendre.`,
    aVerifier: aReprendre.length === 0 ? "Rien : chaque indicateur est conforme et a sa preuve." : aReprendre.map((i) => `- Indicateur ${i.numero} (${raison(i)}) : ${intitule(i.intitule)}`).join("\n"),
    aReprendre: aReprendre.length,
  };
}
