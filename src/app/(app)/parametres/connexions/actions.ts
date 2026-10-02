"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { journaliser } from "@/lib/journal";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";
import { adresseWebhookInvalide, envoyerEssai, EVENEMENTS_WEBHOOK, renvoyer } from "@/lib/webhooks";

export type EtatConnexion = { erreur?: string; succes?: string };

const CHEMIN = "/parametres/connexions";

export async function ajouterWebhook(_p: EtatConnexion, donnees: FormData): Promise<EtatConnexion> {
  const admin = await exigerRole("ADMIN");
  const r = z
    .object({
      nom: z.string().trim().min(1, "Donnez un nom à la connexion (ex. « Tableau des inscriptions »).").max(100),
      url: z.string().trim().min(1, "Collez l'adresse du webhook Make."),
      evenements: z.array(z.enum(Object.keys(EVENEMENTS_WEBHOOK) as [string, ...string[]])).min(1, "Cochez au moins un événement."),
    })
    .safeParse({ nom: donnees.get("nom"), url: donnees.get("url"), evenements: donnees.getAll("evenements") });
  if (!r.success) return { erreur: r.error.issues[0]?.message ?? "Saisie invalide." };
  const invalide = adresseWebhookInvalide(r.data.url);
  if (invalide) return { erreur: invalide };

  const w = await prisma.webhook.create({ data: { ...r.data, createdById: admin.id } });
  await journaliser({ action: "webhook.created", summary: `Connexion externe ajoutée : ${w.nom}`, entityType: "Webhook", entityId: w.id, userId: admin.id });
  revalidatePath(CHEMIN);
  return { succes: "Connexion ajoutée. Envoyez une ligne d'essai pour que Make découvre les colonnes." };
}

export async function piloterWebhook(donnees: FormData): Promise<EtatConnexion> {
  const admin = await exigerRole("ADMIN");
  const id = String(donnees.get("id") ?? "");
  const operation = String(donnees.get("operation") ?? "");
  const w = await prisma.webhook.findUnique({ where: { id } });
  if (!w) return { erreur: "Connexion introuvable." };

  if (operation === "essai") {
    const echec = await envoyerEssai(id);
    return echec ? { erreur: echec } : { succes: "Ligne d'essai envoyée à Make." };
  }
  if (operation === "basculer") {
    await prisma.webhook.update({ where: { id }, data: { actif: !w.actif } });
  } else if (operation === "supprimer") {
    await prisma.webhook.delete({ where: { id } });
  } else {
    return { erreur: "Opération inconnue." };
  }
  await journaliser({
    action: `webhook.${operation === "supprimer" ? "deleted" : "updated"}`,
    summary: `Connexion externe ${operation === "supprimer" ? "supprimée" : w.actif ? "désactivée" : "activée"} : ${w.nom}`,
    entityType: "Webhook",
    entityId: id,
    userId: admin.id,
  });
  revalidatePath(CHEMIN);
  return {};
}

export async function renvoyerEnvoi(donnees: FormData): Promise<void> {
  await exigerRole("ADMIN");
  await renvoyer(String(donnees.get("id") ?? ""));
  revalidatePath(CHEMIN);
}
