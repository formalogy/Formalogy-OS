import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth";

// Toutes les opérations d'authentification (connexion, déconnexion, session)
// passent par cette adresse unique.
export const { GET, POST } = toNextJsHandler(auth);
