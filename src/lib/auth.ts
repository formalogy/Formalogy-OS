import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

import { prisma } from "@/lib/prisma";

// Authentification de Formalogy OS.
//
// L'outil est interne : il n'existe aucune inscription publique. Les comptes
// sont créés par un administrateur depuis les Paramètres, ou par le script
// d'amorçage (prisma/seed.ts) pour le tout premier compte.
//
// Les apprenants n'ont jamais de compte : ils ne sont que des fiches en base.
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),

  emailAndPassword: {
    enabled: true,
    // Aucune ouverture de compte depuis l'extérieur.
    disableSignUp: true,
    // 12 caractères minimum : ces comptes donnent accès à des données
    // personnelles d'apprenants et à la facturation.
    minPasswordLength: 12,
  },

  databaseHooks: {
    session: {
      create: {
        // Un compte désactivé (formateur dont l'accès est fermé, par exemple)
        // ne peut plus ouvrir de session, même avec le bon mot de passe.
        before: async (session) => {
          const compte = await prisma.user.findUnique({
            where: { id: session.userId },
            select: { isActive: true, deletedAt: true },
          });
          if (!compte?.isActive || compte.deletedAt) return false;
        },
        // Connexion réussie : la fiche affiche « dernière connexion » sans
        // avoir à interroger la table des sessions à chaque consultation.
        after: async (session) => {
          await prisma.user
            .update({ where: { id: session.userId }, data: { lastLoginAt: new Date() } })
            .catch(() => undefined);
        },
      },
    },
  },

  session: {
    // Une semaine, prolongée à chaque journée d'utilisation.
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },

  user: {
    additionalFields: {
      role: {
        type: "string",
        required: true,
        defaultValue: "GESTIONNAIRE",
        // Le rôle ne doit jamais pouvoir être modifié par l'utilisateur
        // lui-même : seul un administrateur le change, côté serveur.
        input: false,
      },
      isActive: {
        type: "boolean",
        required: true,
        defaultValue: true,
        input: false,
      },
    },
  },
});
