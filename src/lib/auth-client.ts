"use client";

import { createAuthClient } from "better-auth/react";

// Utilisé par les écrans côté navigateur (formulaire de connexion, déconnexion).
// Ne contient aucun secret : tout passe par /api/auth, côté serveur.
export const authClient = createAuthClient();

export const { signIn, signOut, useSession } = authClient;
