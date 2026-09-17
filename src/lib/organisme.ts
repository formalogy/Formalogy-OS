import "server-only";

import { prisma } from "@/lib/prisma";

/// Informations de l'organisme (Paramètres → Organisme).
export async function lireOrganisme() {
  return (
    (await prisma.organisme.findUnique({ where: { id: "organisme" } })) ??
    prisma.organisme.create({ data: { id: "organisme", raisonSociale: "Formalogy" } })
  );
}

/// Informations indispensables aux attestations et certificats.
export function manquesOrganisme(o: Awaited<ReturnType<typeof lireOrganisme>>): string[] {
  const manques: string[] = [];
  if (!o.siret) manques.push("SIRET");
  if (!o.numeroDeclaration) manques.push("numéro de déclaration d'activité");
  if (!o.adresse || !o.codePostal || !o.ville) manques.push("adresse complète");
  if (!o.representantNom) manques.push("nom du signataire");
  return manques;
}
