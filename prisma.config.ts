import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

// Les commandes Prisma ne lisent plus le fichier .env automatiquement.
if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

// Configuration utilisée par les commandes Prisma (migrations, introspection).
// Supabase impose une connexion DIRECTE pour modifier la structure de la base :
// le pooler ne supporte pas ce type d'opération.
// L'application, elle, passe par le pooler — voir src/lib/prisma.ts.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DIRECT_URL ?? "",
  },
});
