"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { executerPlanifiees, lireRegle } from "@/lib/automatisations/moteur";
import { variablesInconnues } from "@/lib/emails/modeles";
import { journaliser } from "@/lib/journal";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";

export type EtatFormulaire = { erreur?: string; succes?: string; valeurs?: Record<string, string> };

// ---------------------------------------------------------------------------
// Modèles d'emails — modification réservée aux administrateurs
// ---------------------------------------------------------------------------

const schemaModele = z.object({
  id: z.string().min(1),
  nom: z.string().trim().min(1, "Le nom est obligatoire."),
  description: z.string().trim().optional(),
  sujet: z.string().trim().min(1, "Le sujet est obligatoire.").max(200, "Le sujet est trop long (200 caractères maximum)."),
  corps: z.string().trim().min(1, "Le message est obligatoire."),
  actif: z.enum(["on"]).optional(),
});

export async function modifierModele(_precedent: EtatFormulaire, donnees: FormData): Promise<EtatFormulaire> {
  const utilisateur = await exigerRole("ADMIN");
  const valeurs = Object.fromEntries([...donnees.entries()].map(([k, v]) => [k, String(v)]));

  const r = schemaModele.safeParse(valeurs);
  if (!r.success) return { erreur: r.error.issues[0]?.message ?? "Saisie invalide.", valeurs };

  // Une variable mal orthographiée resterait telle quelle dans l'email reçu :
  // on la bloque avant qu'elle ne parte.
  const inconnues = variablesInconnues(`${r.data.sujet}\n${r.data.corps}`);
  if (inconnues.length) {
    return {
      erreur: `Variable inconnue : ${inconnues.map((v) => `{{${v}}}`).join(", ")}. Consultez la liste des variables disponibles.`,
      valeurs,
    };
  }

  const modele = await prisma.emailTemplate.update({
    where: { id: r.data.id },
    data: {
      nom: r.data.nom,
      description: r.data.description || null,
      sujet: r.data.sujet,
      corps: r.data.corps,
      actif: r.data.actif === "on",
    },
  });

  await journaliser({
    action: "email_template.updated",
    summary: `Modèle d'email modifié : ${modele.nom}`,
    entityType: "EmailTemplate",
    entityId: modele.id,
    userId: utilisateur.id,
  });

  revalidatePath("/parametres/modeles-emails");
  return { succes: "Modèle enregistré." };
}

// ---------------------------------------------------------------------------
// Automatisations — réservées aux administrateurs
// ---------------------------------------------------------------------------

export async function basculerAutomatisation(_precedent: EtatFormulaire, donnees: FormData): Promise<EtatFormulaire> {
  const utilisateur = await exigerRole("ADMIN");
  const id = String(donnees.get("id") ?? "");
  const automation = await prisma.automation.findUnique({ where: { id } });
  if (!automation) return { erreur: "Automatisation introuvable." };

  // On refuse d'activer une règle mal formée ou dont un modèle manque : mieux
  // vaut un refus visible maintenant qu'un échec silencieux plus tard.
  if (!automation.actif) {
    let actions;
    try {
      actions = lireRegle(automation).actions;
    } catch {
      return { erreur: "Cette règle est mal formée et ne peut pas être activée." };
    }
    for (const action of actions) {
      if (action.type === "EMAIL") {
        const modele = await prisma.emailTemplate.findUnique({ where: { code: action.modele } });
        if (!modele?.actif) {
          return { erreur: `Le modèle d'email « ${action.modele} » est absent ou désactivé : activez-le d'abord.` };
        }
      }
    }
  }

  const misAJour = await prisma.automation.update({ where: { id }, data: { actif: !automation.actif } });
  await journaliser({
    action: misAJour.actif ? "automation.enabled" : "automation.disabled",
    summary: `Automatisation « ${misAJour.nom} » ${misAJour.actif ? "activée" : "désactivée"}`,
    entityType: "Automation",
    entityId: misAJour.id,
    userId: utilisateur.id,
  });
  revalidatePath("/parametres/automatisations");
  return {};
}

export async function modifierDelai(donnees: FormData): Promise<void> {
  await exigerRole("ADMIN");
  const r = z
    .object({ id: z.string().min(1), jours: z.coerce.number().int().min(0).max(60) })
    .safeParse(Object.fromEntries(donnees));
  if (!r.success) return;

  const automation = await prisma.automation.findUnique({ where: { id: r.data.id } });
  if (!automation || automation.declencheur !== "SESSION_AVANT_DEBUT") return;

  await prisma.automation.update({
    where: { id: r.data.id },
    data: { parametres: { ...(automation.parametres as object), jours: r.data.jours } },
  });
  revalidatePath("/parametres/automatisations");
}

export async function lancerAutomatisations(_precedent: EtatFormulaire): Promise<EtatFormulaire> {
  const utilisateur = await exigerRole("ADMIN");
  const bilan = await executerPlanifiees();
  await journaliser({
    action: "automation.manual_run",
    summary: `Automatisations planifiées lancées manuellement : ${bilan.traites} cas traité(s)`,
    userId: utilisateur.id,
  });
  revalidatePath("/parametres/automatisations");
  return {
    succes:
      bilan.traites === 0
        ? "Aucun nouveau cas à traiter."
        : `${bilan.traites} cas traité${bilan.traites > 1 ? "s" : ""}.`,
  };
}
