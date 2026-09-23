"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { enCentimes, formaterMontant, lireMontant } from "@/lib/factures";
import { TYPES_FINANCEUR } from "@/lib/financements";
import { journaliser } from "@/lib/journal";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";
import { jourDepuisSaisie } from "@/lib/sessions-libelles";

export type EtatFormulaire = { erreur?: string; succes?: string; valeurs?: Record<string, string> };

function saisie(donnees: FormData): Record<string, string> {
  return Object.fromEntries([...donnees.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;
}

function rafraichir(dossier: { id: string; sessionId: string | null }) {
  revalidatePath("/financements");
  revalidatePath(`/financements/${dossier.id}`);
  if (dossier.sessionId) revalidatePath(`/sessions/${dossier.sessionId}`);
}

const texteFacultatif = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

const schema = z.object({
  financeurType: z.enum(TYPES_FINANCEUR as [string, ...string[]]),
  financeurNom: z.string().trim().min(1, "Indiquez le nom du financeur."),
  reference: texteFacultatif,
  sessionId: texteFacultatif,
  learnerId: texteFacultatif,
  companyId: texteFacultatif,
  montant: texteFacultatif,
  dateDepot: texteFacultatif,
  subrogation: z.enum(["on"]).optional(),
  notes: texteFacultatif,
});

/// Un dossier enregistré est considéré comme un financement acquis : pas de
/// statut de demande à faire évoluer ensuite.
async function lireDossier(donnees: FormData) {
  const r = schema.safeParse(saisie(donnees));
  if (!r.success) return { erreur: r.error.issues[0]?.message ?? "Saisie invalide." } as const;

  let montant: string | null = null;
  if (r.data.montant) {
    const m = lireMontant(r.data.montant);
    if (!m || enCentimes(m) <= 0) return { erreur: "Le montant doit être positif, ex. 1250 ou 1250,50." } as const;
    montant = m;
  }
  let dateDepot: Date | null = null;
  if (r.data.dateDepot) {
    dateDepot = jourDepuisSaisie(r.data.dateDepot);
    if (!dateDepot) return { erreur: "Date de dépôt invalide." } as const;
  }

  const [session, apprenant, entreprise] = await Promise.all([
    r.data.sessionId ? prisma.trainingSession.findFirst({ where: { id: r.data.sessionId, deletedAt: null } }) : null,
    r.data.learnerId ? prisma.learner.findFirst({ where: { id: r.data.learnerId, deletedAt: null } }) : null,
    r.data.companyId ? prisma.company.findFirst({ where: { id: r.data.companyId, deletedAt: null } }) : null,
  ]);
  if ((r.data.sessionId && !session) || (r.data.learnerId && !apprenant) || (r.data.companyId && !entreprise)) {
    return { erreur: "Un des éléments rattachés n'existe plus. Rechargez la page." } as const;
  }

  return {
    data: {
      financeurType: r.data.financeurType as never,
      financeurNom: r.data.financeurNom,
      reference: r.data.reference ?? null,
      sessionId: r.data.sessionId ?? null,
      learnerId: r.data.learnerId ?? null,
      companyId: r.data.companyId ?? null,
      montant,
      dateDepot,
      subrogation: r.data.subrogation === "on",
      notes: r.data.notes ?? null,
    },
  } as const;
}

export async function creerDossier(_precedent: EtatFormulaire, donnees: FormData): Promise<EtatFormulaire> {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");
  const l = await lireDossier(donnees);
  if ("erreur" in l) return { erreur: l.erreur, valeurs: saisie(donnees) };

  const dossier = await prisma.dossierFinancement.create({ data: { ...l.data, createdById: utilisateur.id } });
  await journaliser({
    action: "funding.created",
    summary: `Dossier de financement créé : ${dossier.financeurNom}${dossier.montant ? ` — ${formaterMontant(dossier.montant)}` : ""}`,
    entityType: "DossierFinancement",
    entityId: dossier.id,
    userId: utilisateur.id,
  });
  rafraichir(dossier);
  redirect(`/financements/${dossier.id}`);
}

export async function modifierDossier(_precedent: EtatFormulaire, donnees: FormData): Promise<EtatFormulaire> {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");
  const id = String(donnees.get("id") ?? "");
  const existant = await prisma.dossierFinancement.findUnique({ where: { id } });
  if (!existant) return { erreur: "Dossier introuvable." };

  const l = await lireDossier(donnees);
  if ("erreur" in l) return { erreur: l.erreur, valeurs: saisie(donnees) };

  await prisma.dossierFinancement.update({ where: { id }, data: l.data });
  await journaliser({
    action: "funding.updated",
    summary: `Dossier de financement modifié : ${l.data.financeurNom}`,
    entityType: "DossierFinancement",
    entityId: id,
    userId: utilisateur.id,
  });
  rafraichir(existant);
  redirect(`/financements/${id}`);
}

export async function supprimerDossier(donnees: FormData): Promise<void> {
  const utilisateur = await exigerRole("ADMIN");
  const id = String(donnees.get("id") ?? "");
  const dossier = await prisma.dossierFinancement.findUnique({ where: { id } });
  if (!dossier) return;

  await prisma.dossierFinancement.delete({ where: { id } });
  await journaliser({
    action: "funding.deleted",
    summary: `Dossier de financement supprimé : ${dossier.financeurNom}`,
    entityType: "DossierFinancement",
    entityId: id,
    userId: utilisateur.id,
  });
  rafraichir(dossier);
  redirect("/financements");
}
