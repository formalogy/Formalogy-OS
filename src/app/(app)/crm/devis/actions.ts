"use server";

import type { StatutDevis } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { LIBELLE_STATUT_DEVIS, synchroniserDevis } from "@/lib/devis";
import { journaliser } from "@/lib/journal";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";

export type EtatDevis = { message?: string; erreur?: string };

/// Reprend tout de suite les devis de Henrri (sinon fait à chaque réveil).
export async function actualiserDevis(): Promise<EtatDevis> {
  await exigerRole("ADMIN", "GESTIONNAIRE");
  try {
    const { nouveaux, acceptes } = await synchroniserDevis();
    revalidatePath("/crm/devis");
    return {
      message:
        nouveaux + acceptes === 0
          ? "Rien de nouveau dans Henrri."
          : [nouveaux && `${nouveaux} nouveau${nouveaux > 1 ? "x" : ""} devis`, acceptes && `${acceptes} accepté${acceptes > 1 ? "s" : ""}`].filter(Boolean).join(", ") + ".",
    };
  } catch (erreur) {
    return { erreur: erreur instanceof Error ? erreur.message : "Henrri ne répond pas." };
  }
}

const schemaClassement = z.object({ id: z.string().min(1), statut: z.enum(["EN_ATTENTE", "ACCEPTE", "REFUSE", "SANS_SUITE"]) });

/// Classement à la main : accepté, refusé, sans suite, ou rouvert (les
/// relances reprennent alors là où elles en étaient).
export async function classerDevis(donnees: FormData): Promise<void> {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");
  const r = schemaClassement.safeParse({ id: donnees.get("id"), statut: donnees.get("statut") });
  if (!r.success) return;
  const statut: StatutDevis = r.data.statut;
  const devis = await prisma.devis.update({
    where: { id: r.data.id },
    data: {
      statut,
      motifStatut: statut === "EN_ATTENTE" ? null : "Classé à la main",
      statutAt: statut === "EN_ATTENTE" ? null : new Date(),
    },
  });
  await journaliser({
    action: "quote.status_changed",
    summary: `Devis ${devis.numero} (${devis.clientNom}) : ${LIBELLE_STATUT_DEVIS[statut].toLowerCase()}`,
    entityType: "Devis",
    entityId: devis.id,
    userId: utilisateur.id,
  });
  revalidatePath("/crm/devis");
}
