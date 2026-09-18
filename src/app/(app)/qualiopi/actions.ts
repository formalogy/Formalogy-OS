"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { journaliser } from "@/lib/journal";
import { prisma } from "@/lib/prisma";
import { ORIGINES_ACTION, STATUTS_ACTION } from "@/lib/qualiopi";
import { exigerRole } from "@/lib/session";
import { jourDepuisSaisie } from "@/lib/sessions-libelles";

export type EtatFormulaire = { erreur?: string; succes?: string; valeurs?: Record<string, string> };

function rafraichir() {
  revalidatePath("/qualiopi");
  revalidatePath("/qualiopi/actions");
}

/// Coche ou décoche un indicateur : « conforme » signifie que les preuves sont
/// réunies et à jour pour l'audit.
export async function basculerIndicateur(donnees: FormData): Promise<void> {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");
  const numero = Number(donnees.get("numero"));
  const indicateur = await prisma.indicateurQualiopi.findUnique({ where: { numero } });
  if (!indicateur) return;

  const conforme = indicateur.statut !== "CONFORME";
  await prisma.indicateurQualiopi.update({
    where: { numero },
    data: { statut: conforme ? "CONFORME" : "A_FAIRE", updatedById: utilisateur.id },
  });
  await journaliser({
    action: conforme ? "qualiopi.indicator_ok" : "qualiopi.indicator_reopened",
    summary: `Indicateur Qualiopi ${numero} ${conforme ? "marqué conforme" : "rouvert"}`,
    entityType: "IndicateurQualiopi",
    entityId: String(numero),
    userId: utilisateur.id,
  });
  rafraichir();
}

/// Un indicateur spécifique ne concerne pas tous les organismes : on le
/// déclare applicable ou non, et il sort alors du calcul d'avancement.
export async function basculerApplicabilite(donnees: FormData): Promise<void> {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");
  const numero = Number(donnees.get("numero"));
  const indicateur = await prisma.indicateurQualiopi.findUnique({ where: { numero } });
  if (!indicateur || !indicateur.specifique) return;

  await prisma.indicateurQualiopi.update({
    where: { numero },
    data: { applicable: !indicateur.applicable, updatedById: utilisateur.id },
  });
  await journaliser({
    action: "qualiopi.indicator_scope",
    summary: `Indicateur Qualiopi ${numero} déclaré ${indicateur.applicable ? "non applicable" : "applicable"}`,
    entityType: "IndicateurQualiopi",
    entityId: String(numero),
    userId: utilisateur.id,
  });
  rafraichir();
}

export async function enregistrerNotesIndicateur(_precedent: EtatFormulaire, donnees: FormData): Promise<EtatFormulaire> {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");
  const numero = Number(donnees.get("numero"));
  const notes = String(donnees.get("notes") ?? "").trim().slice(0, 4000);
  if (!Number.isInteger(numero)) return { erreur: "Indicateur introuvable." };

  const r = await prisma.indicateurQualiopi.updateMany({
    where: { numero },
    data: { notes: notes || null, updatedById: utilisateur.id },
  });
  if (r.count === 0) return { erreur: "Indicateur introuvable." };

  rafraichir();
  return { succes: "Enregistré." };
}

/// Détache une preuve d'un indicateur, sans supprimer le document.
export async function detacherPreuve(donnees: FormData): Promise<void> {
  await exigerRole("ADMIN", "GESTIONNAIRE");
  const id = String(donnees.get("documentId") ?? "");
  await prisma.document.updateMany({ where: { id }, data: { indicateurQualiopi: null } });
  rafraichir();
}

const schemaAction = z.object({
  titre: z.string().trim().min(1, "Décrivez l'action à mener."),
  description: z.string().trim().max(2000).optional(),
  origine: z.enum(ORIGINES_ACTION as [string, ...string[]]),
  numeroIndicateur: z.string().optional(),
  responsable: z.string().trim().max(120).optional(),
  echeance: z.string().optional(),
});

export async function creerActionQualite(_precedent: EtatFormulaire, donnees: FormData): Promise<EtatFormulaire> {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");
  const valeurs = Object.fromEntries([...donnees.entries()].map(([k, v]) => [k, String(v)]));

  const r = schemaAction.safeParse(valeurs);
  if (!r.success) return { erreur: r.error.issues[0]?.message ?? "Saisie invalide.", valeurs };

  const numero = r.data.numeroIndicateur ? Number(r.data.numeroIndicateur) : null;
  if (numero !== null && !(await prisma.indicateurQualiopi.findUnique({ where: { numero } }))) {
    return { erreur: "Indicateur introuvable.", valeurs };
  }
  let echeance: Date | null = null;
  if (r.data.echeance) {
    echeance = jourDepuisSaisie(r.data.echeance);
    if (!echeance) return { erreur: "Échéance invalide.", valeurs };
  }

  const action = await prisma.actionQualite.create({
    data: {
      titre: r.data.titre,
      description: r.data.description || null,
      origine: r.data.origine as never,
      numeroIndicateur: numero,
      responsable: r.data.responsable || null,
      echeance,
      createdById: utilisateur.id,
    },
  });
  await journaliser({
    action: "quality_action.created",
    summary: `Action qualité créée : ${action.titre}${numero ? ` (indicateur ${numero})` : ""}`,
    entityType: "ActionQualite",
    entityId: action.id,
    userId: utilisateur.id,
  });
  rafraichir();
  return { succes: "Action ajoutée." };
}

export async function changerStatutAction(donnees: FormData): Promise<void> {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");
  const id = String(donnees.get("id") ?? "");
  const statut = z.enum(STATUTS_ACTION as [string, ...string[]]).safeParse(donnees.get("statut"));
  if (!statut.success) return;

  const action = await prisma.actionQualite.findUnique({ where: { id } });
  if (!action) return;

  await prisma.actionQualite.update({
    where: { id },
    data: { statut: statut.data as never, faiteAt: statut.data === "FAITE" ? new Date() : null },
  });
  if (statut.data === "FAITE") {
    await journaliser({
      action: "quality_action.done",
      summary: `Action qualité terminée : ${action.titre}`,
      entityType: "ActionQualite",
      entityId: id,
      userId: utilisateur.id,
    });
  }
  rafraichir();
}

export async function supprimerActionQualite(donnees: FormData): Promise<void> {
  const utilisateur = await exigerRole("ADMIN");
  const id = String(donnees.get("id") ?? "");
  const action = await prisma.actionQualite.findUnique({ where: { id } });
  if (!action) return;

  await prisma.actionQualite.delete({ where: { id } });
  await journaliser({
    action: "quality_action.deleted",
    summary: `Action qualité supprimée : ${action.titre}`,
    entityType: "ActionQualite",
    entityId: id,
    userId: utilisateur.id,
  });
  rafraichir();
}
