import "server-only";

import { OPCO_CONNUS } from "@/lib/inscriptions-facturation";
import { prisma } from "@/lib/prisma";

/// Noms proposés à la saisie d'un financeur : les onze OPCO, et ceux déjà
/// utilisés dans les dossiers de financement (même orthographe, donc même
/// client chez Henrri).
export async function financeursConnus(): Promise<string[]> {
  const dossiers = await prisma.dossierFinancement.findMany({ distinct: ["financeurNom"], select: { financeurNom: true } });
  return [...new Set([...OPCO_CONNUS, ...dossiers.map((d) => d.financeurNom.trim())])].sort((a, b) => a.localeCompare(b, "fr"));
}
