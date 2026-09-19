"use server";

import { randomBytes } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { journaliser } from "@/lib/journal";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";

/// Mot de passe provisoire : renvoyé une seule fois, jamais stocké en clair.
export type EtatAcces = { erreur?: string; motDePasse?: string; email?: string; valeurs?: Record<string, string> };

const ROLES_INTERNES_TUPLE = ["ADMIN", "GESTIONNAIRE"] as const;
const ROLES_INTERNES: ("ADMIN" | "GESTIONNAIRE")[] = [...ROLES_INTERNES_TUPLE];

function motDePasseProvisoire(): string {
  return randomBytes(18).toString("base64url");
}

async function empreinte(motDePasse: string): Promise<string> {
  const contexte = await auth.$context;
  return contexte.password.hash(motDePasse);
}

function rafraichir() {
  revalidatePath("/parametres/utilisateurs");
}

const schemaCreation = z.object({
  nom: z.string().trim().min(1, "Indiquez le nom."),
  email: z.email("Adresse email invalide.").trim().toLowerCase(),
  role: z.enum(ROLES_INTERNES_TUPLE),
});

/// Crée un compte interne (administrateur ou gestionnaire) et affiche son mot
/// de passe provisoire, une seule fois. Réservé aux administrateurs — comme
/// pour un formateur, c'est le seul moment où ce mot de passe est visible.
export async function creerUtilisateur(_precedent: EtatAcces, donnees: FormData): Promise<EtatAcces> {
  const admin = await exigerRole("ADMIN");
  const valeurs = Object.fromEntries([...donnees.entries()].map(([k, v]) => [k, String(v)]));

  const r = schemaCreation.safeParse(valeurs);
  if (!r.success) return { erreur: r.error.issues[0]?.message ?? "Saisie invalide.", valeurs };

  const existant = await prisma.user.findUnique({ where: { email: r.data.email } });
  if (existant) return { erreur: "Un compte existe déjà avec cette adresse email.", valeurs };

  const motDePasse = motDePasseProvisoire();
  const hache = await empreinte(motDePasse);

  const compte = await prisma.$transaction(async (tx) => {
    const nouveau = await tx.user.create({
      data: { name: r.data.nom, email: r.data.email, emailVerified: true, role: r.data.role },
    });
    await tx.account.create({
      data: { accountId: nouveau.id, providerId: "credential", userId: nouveau.id, password: hache },
    });
    return nouveau;
  });

  await journaliser({
    action: "user.created",
    summary: `Compte ${r.data.role} créé pour ${r.data.nom} (${r.data.email})`,
    entityType: "User",
    entityId: compte.id,
    userId: admin.id,
  });

  rafraichir();
  return { motDePasse, email: compte.email };
}

/// Génère un nouveau mot de passe et déconnecte l'utilisateur de partout.
export async function reinitialiserMotDePasse(_precedent: EtatAcces, donnees: FormData): Promise<EtatAcces> {
  const admin = await exigerRole("ADMIN");
  const id = String(donnees.get("id") ?? "");

  const compte = await prisma.user.findFirst({ where: { id, role: { in: ROLES_INTERNES }, deletedAt: null } });
  if (!compte) return { erreur: "Compte introuvable." };

  const motDePasse = motDePasseProvisoire();
  const hache = await empreinte(motDePasse);
  await prisma.$transaction([
    prisma.account.updateMany({ where: { userId: compte.id, providerId: "credential" }, data: { password: hache } }),
    prisma.session.deleteMany({ where: { userId: compte.id } }),
  ]);

  await journaliser({
    action: "user.password_reset",
    summary: `Nouveau mot de passe généré pour ${compte.name}`,
    entityType: "User",
    entityId: compte.id,
    userId: admin.id,
  });

  rafraichir();
  return { motDePasse, email: compte.email };
}

/// Désactive un compte : connexions coupées immédiatement, historique
/// conservé. Un administrateur ne peut désactiver ni son propre compte, ni le
/// dernier administrateur actif — sous peine de verrouiller l'application.
export async function desactiverUtilisateur(donnees: FormData): Promise<{ erreur?: string }> {
  const admin = await exigerRole("ADMIN");
  const id = String(donnees.get("id") ?? "");
  if (id === admin.id) return { erreur: "Vous ne pouvez pas désactiver votre propre compte." };

  const compte = await prisma.user.findFirst({ where: { id, role: { in: ROLES_INTERNES }, deletedAt: null } });
  if (!compte || !compte.isActive) return {};

  if (compte.role === "ADMIN") {
    const autresAdmins = await prisma.user.count({
      where: { role: "ADMIN", isActive: true, deletedAt: null, id: { not: id } },
    });
    if (autresAdmins === 0) return { erreur: "Impossible : ce serait le dernier compte administrateur actif." };
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id }, data: { isActive: false } }),
    prisma.session.deleteMany({ where: { userId: id } }),
  ]);

  await journaliser({
    action: "user.deactivated",
    summary: `Compte désactivé : ${compte.name}`,
    entityType: "User",
    entityId: id,
    userId: admin.id,
  });

  rafraichir();
  return {};
}

export async function reactiverUtilisateur(donnees: FormData): Promise<void> {
  const admin = await exigerRole("ADMIN");
  const id = String(donnees.get("id") ?? "");
  const r = await prisma.user.updateMany({
    where: { id, role: { in: ROLES_INTERNES }, deletedAt: null, isActive: false },
    data: { isActive: true },
  });
  if (r.count === 0) return;

  const compte = await prisma.user.findUniqueOrThrow({ where: { id } });
  await journaliser({
    action: "user.reactivated",
    summary: `Compte réactivé : ${compte.name}`,
    entityType: "User",
    entityId: id,
    userId: admin.id,
  });
  rafraichir();
}

/// Change le rôle d'un compte interne. On ne peut pas se retirer soi-même le
/// rôle administrateur, ni retirer le dernier administrateur actif.
export async function changerRoleUtilisateur(donnees: FormData): Promise<{ erreur?: string }> {
  const admin = await exigerRole("ADMIN");
  const id = String(donnees.get("id") ?? "");
  const role = z.enum(ROLES_INTERNES_TUPLE).safeParse(donnees.get("role"));
  if (!role.success) return { erreur: "Rôle invalide." };

  const compte = await prisma.user.findFirst({ where: { id, role: { in: ROLES_INTERNES }, deletedAt: null } });
  if (!compte || compte.role === role.data) return {};

  if (compte.role === "ADMIN" && role.data !== "ADMIN") {
    if (id === admin.id) return { erreur: "Vous ne pouvez pas vous retirer vous-même le rôle administrateur." };
    const autresAdmins = await prisma.user.count({
      where: { role: "ADMIN", isActive: true, deletedAt: null, id: { not: id } },
    });
    if (autresAdmins === 0) return { erreur: "Impossible : ce serait le dernier compte administrateur actif." };
  }

  await prisma.user.update({ where: { id }, data: { role: role.data } });
  await journaliser({
    action: "user.role_changed",
    summary: `Rôle de ${compte.name} changé : ${compte.role} → ${role.data}`,
    entityType: "User",
    entityId: id,
    userId: admin.id,
  });
  rafraichir();
  return {};
}
