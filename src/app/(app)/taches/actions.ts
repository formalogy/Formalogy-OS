"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { journaliser } from "@/lib/journal";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";
import { jourDepuisSaisie } from "@/lib/sessions-libelles";

export type EtatFormulaire = { erreur?: string; valeurs?: Record<string, string> };

export async function creerTache(_precedent: EtatFormulaire, donnees: FormData): Promise<EtatFormulaire> {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");
  const valeurs = Object.fromEntries([...donnees.entries()].map(([k, v]) => [k, String(v)]));

  const r = z
    .object({
      titre: z.string().trim().min(1, "Décrivez la tâche."),
      echeance: z.string().optional(),
      priorite: z.enum(["BASSE", "NORMALE", "HAUTE"]),
    })
    .safeParse(valeurs);
  if (!r.success) return { erreur: r.error.issues[0]?.message ?? "Saisie invalide.", valeurs };

  const echeance = r.data.echeance ? jourDepuisSaisie(r.data.echeance) : null;
  if (r.data.echeance && !echeance) return { erreur: "Date d'échéance invalide.", valeurs };

  await prisma.task.create({
    data: { titre: r.data.titre, echeance, priorite: r.data.priorite, createdById: utilisateur.id },
  });

  revalidatePath("/taches");
  revalidatePath("/tableau-de-bord");
  return {};
}

export async function basculerTache(donnees: FormData): Promise<void> {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");
  const id = String(donnees.get("id") ?? "");
  const tache = await prisma.task.findUnique({ where: { id } });
  if (!tache) return;

  const faite = tache.statut === "A_FAIRE";
  await prisma.task.update({
    where: { id },
    data: { statut: faite ? "FAITE" : "A_FAIRE", faiteAt: faite ? new Date() : null },
  });

  if (faite) {
    await journaliser({
      action: "task.done",
      summary: `Tâche terminée : ${tache.titre}`,
      entityType: "Task",
      entityId: tache.id,
      userId: utilisateur.id,
    });
  }

  revalidatePath("/taches");
  revalidatePath("/tableau-de-bord");
}
