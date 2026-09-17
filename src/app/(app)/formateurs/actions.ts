"use server";

import { randomBytes } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { journaliser } from "@/lib/journal";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";

export type EtatFormulaire = {
  erreur?: string;
  valeurs?: Record<string, string>;
};

/// Résultat d'une ouverture d'accès : le mot de passe provisoire n'est
/// renvoyé qu'une fois, à l'écran de l'administrateur, et jamais stocké.
export type EtatAcces = {
  erreur?: string;
  motDePasse?: string;
  email?: string;
};

function saisie(donnees: FormData): Record<string, string> {
  const valeurs: Record<string, string> = {};
  for (const [cle, valeur] of donnees.entries()) {
    if (typeof valeur === "string") valeurs[cle] = valeur;
  }
  return valeurs;
}

const texteFacultatif = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

const schemaFormateur = z.object({
  prenom: z.string().trim().min(1, "Le prénom est obligatoire."),
  nom: z.string().trim().min(1, "Le nom est obligatoire."),
  email: texteFacultatif.refine(
    (v) => v === undefined || z.email().safeParse(v).success,
    "L'adresse email n'est pas valide.",
  ),
  telephone: texteFacultatif,
  statut: z.enum(["INDEPENDANT", "SALARIE", "SOUS_TRAITANT"]),
  siret: texteFacultatif.refine(
    (v) => v === undefined || /^\d{14}$/.test(v.replace(/\s/g, "")),
    "Le SIRET doit comporter 14 chiffres.",
  ),
  specialites: texteFacultatif,
  tarifJournalierHT: texteFacultatif.refine(
    (v) => v === undefined || /^\d+([.,]\d{1,2})?$/.test(v),
    "Le tarif journalier doit être un montant, ex. 450 ou 450,50.",
  ),
  notes: texteFacultatif,
});

function donneesFormateur(d: z.infer<typeof schemaFormateur>) {
  return {
    prenom: d.prenom,
    nom: d.nom,
    email: d.email?.toLowerCase() ?? null,
    telephone: d.telephone ?? null,
    statut: d.statut,
    siret: d.siret?.replace(/\s/g, "") ?? null,
    specialites: d.specialites ?? null,
    tarifJournalierHT: d.tarifJournalierHT ? d.tarifJournalierHT.replace(",", ".") : null,
    notes: d.notes ?? null,
  };
}

export async function creerFormateur(_precedent: EtatFormulaire, donnees: FormData): Promise<EtatFormulaire> {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");

  const r = schemaFormateur.safeParse(Object.fromEntries(donnees));
  if (!r.success) return { erreur: r.error.issues[0]?.message ?? "Saisie invalide.", valeurs: saisie(donnees) };

  const formateur = await prisma.trainer.create({
    data: { ...donneesFormateur(r.data), createdById: utilisateur.id },
  });

  await journaliser({
    action: "trainer.created",
    summary: `Formateur créé : ${formateur.prenom} ${formateur.nom}`,
    entityType: "Trainer",
    entityId: formateur.id,
    userId: utilisateur.id,
  });

  revalidatePath("/formateurs");
  redirect(`/formateurs/${formateur.id}`);
}

export async function modifierFormateur(_precedent: EtatFormulaire, donnees: FormData): Promise<EtatFormulaire> {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");

  const id = String(donnees.get("id") ?? "");
  const existant = await prisma.trainer.findFirst({ where: { id, deletedAt: null } });
  if (!existant) return { erreur: "Formateur introuvable.", valeurs: saisie(donnees) };

  const r = schemaFormateur.safeParse(Object.fromEntries(donnees));
  if (!r.success) return { erreur: r.error.issues[0]?.message ?? "Saisie invalide.", valeurs: saisie(donnees) };

  // L'email sert d'identifiant de connexion quand un accès est ouvert : il ne
  // peut pas être modifié ici sans désynchroniser le compte.
  const data = donneesFormateur(r.data);
  if (existant.userId && data.email !== existant.email) {
    return {
      erreur: "Ce formateur a un accès à l'application : son email sert d'identifiant et ne peut pas être modifié. Fermez d'abord son accès.",
      valeurs: saisie(donnees),
    };
  }

  await prisma.trainer.update({ where: { id }, data });

  await journaliser({
    action: "trainer.updated",
    summary: `Fiche formateur modifiée : ${data.prenom} ${data.nom}`,
    entityType: "Trainer",
    entityId: id,
    userId: utilisateur.id,
  });

  revalidatePath("/formateurs");
  redirect(`/formateurs/${id}`);
}

/// Un formateur inactif n'est plus proposé pour de nouvelles sessions ; son
/// historique reste intact. Désactiver la fiche ferme aussi son accès.
export async function basculerActifFormateur(donnees: FormData): Promise<void> {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");
  const id = String(donnees.get("id") ?? "");
  const formateur = await prisma.trainer.findFirst({ where: { id, deletedAt: null }, include: { user: { select: { isActive: true } } } });
  if (!formateur) return;

  const actif = !formateur.actif;
  // Seul un administrateur peut toucher à un compte : un gestionnaire ne peut
  // pas désactiver un formateur qui a un accès ouvert.
  if (!actif && formateur.user?.isActive && utilisateur.role !== "ADMIN") return;

  await prisma.$transaction(async (tx) => {
    await tx.trainer.update({ where: { id }, data: { actif } });
    if (!actif && formateur.userId) {
      await tx.user.update({ where: { id: formateur.userId }, data: { isActive: false } });
      await tx.session.deleteMany({ where: { userId: formateur.userId } });
    }
  });

  await journaliser({
    action: actif ? "trainer.activated" : "trainer.deactivated",
    summary: `Formateur ${actif ? "réactivé" : "désactivé"} : ${formateur.prenom} ${formateur.nom}`,
    entityType: "Trainer",
    entityId: id,
    userId: utilisateur.id,
  });

  revalidatePath(`/formateurs/${id}`);
  revalidatePath("/formateurs");
}

/// 24 caractères aléatoires, sans caractère ambigu à recopier.
function motDePasseProvisoire(): string {
  return randomBytes(18).toString("base64url");
}

async function empreinte(motDePasse: string): Promise<string> {
  // Même algorithme que la connexion : on passe par better-auth.
  const contexte = await auth.$context;
  return contexte.password.hash(motDePasse);
}

/// Ouvre (ou rouvre) l'accès d'un formateur à l'application, en lecture seule
/// sur ses propres sessions. Réservé aux administrateurs.
export async function ouvrirAccesFormateur(_precedent: EtatAcces, donnees: FormData): Promise<EtatAcces> {
  const admin = await exigerRole("ADMIN");
  const id = String(donnees.get("id") ?? "");

  const formateur = await prisma.trainer.findFirst({ where: { id, deletedAt: null }, include: { user: true } });
  if (!formateur) return { erreur: "Formateur introuvable." };
  if (!formateur.actif) return { erreur: "Réactivez d'abord la fiche du formateur." };
  if (!formateur.email) return { erreur: "Renseignez l'email du formateur : il lui sert d'identifiant." };

  const motDePasse = motDePasseProvisoire();
  const hache = await empreinte(motDePasse);

  // Accès déjà existant (éventuellement fermé) : on le rouvre avec un nouveau
  // mot de passe et on déconnecte les sessions en cours.
  if (formateur.user) {
    const compte = formateur.user;
    if (compte.role !== "FORMATEUR") return { erreur: "Le compte lié n'a pas le rôle formateur." };
    await prisma.$transaction([
      prisma.account.updateMany({ where: { userId: compte.id, providerId: "credential" }, data: { password: hache } }),
      prisma.user.update({ where: { id: compte.id }, data: { isActive: true } }),
      prisma.session.deleteMany({ where: { userId: compte.id } }),
    ]);
    await journaliser({
      action: "trainer.access_reset",
      summary: `Accès formateur (ré)ouvert avec un nouveau mot de passe : ${formateur.prenom} ${formateur.nom}`,
      entityType: "Trainer",
      entityId: formateur.id,
      userId: admin.id,
    });
    revalidatePath(`/formateurs/${id}`);
    return { motDePasse, email: compte.email };
  }

  const dejaPris = await prisma.user.findUnique({ where: { email: formateur.email } });
  if (dejaPris) return { erreur: "Un compte utilise déjà cette adresse email." };

  await prisma.$transaction(async (tx) => {
    const compte = await tx.user.create({
      data: {
        name: `${formateur.prenom} ${formateur.nom}`,
        email: formateur.email!,
        emailVerified: true,
        role: "FORMATEUR",
      },
    });
    await tx.account.create({
      data: { accountId: compte.id, providerId: "credential", userId: compte.id, password: hache },
    });
    await tx.trainer.update({ where: { id: formateur.id }, data: { userId: compte.id } });
  });

  await journaliser({
    action: "trainer.access_opened",
    summary: `Accès à l'application ouvert pour le formateur ${formateur.prenom} ${formateur.nom}`,
    entityType: "Trainer",
    entityId: formateur.id,
    userId: admin.id,
  });

  revalidatePath(`/formateurs/${id}`);
  return { motDePasse, email: formateur.email };
}

/// Ferme l'accès : le compte est désactivé (pas supprimé, pour garder
/// l'historique) et toutes ses sessions de connexion sont coupées.
export async function fermerAccesFormateur(donnees: FormData): Promise<void> {
  const admin = await exigerRole("ADMIN");
  const id = String(donnees.get("id") ?? "");
  const formateur = await prisma.trainer.findFirst({ where: { id, deletedAt: null } });
  if (!formateur?.userId) return;

  await prisma.$transaction([
    prisma.user.update({ where: { id: formateur.userId }, data: { isActive: false } }),
    prisma.session.deleteMany({ where: { userId: formateur.userId } }),
  ]);

  await journaliser({
    action: "trainer.access_closed",
    summary: `Accès à l'application fermé pour le formateur ${formateur.prenom} ${formateur.nom}`,
    entityType: "Trainer",
    entityId: formateur.id,
    userId: admin.id,
  });

  revalidatePath(`/formateurs/${id}`);
}
