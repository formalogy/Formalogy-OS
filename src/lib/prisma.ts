import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

// Point d'accès unique à la base de données, réservé au code serveur.
// En développement, Next.js recharge les modules à chaque modification :
// on conserve l'instance sur globalThis pour ne pas ouvrir une connexion
// supplémentaire à chaque rechargement.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL est absente. Copie .env.example vers .env et renseigne la connexion Supabase.",
    );
  }

  // L'application passe par le pooler Supabase ; les migrations, elles,
  // utilisent la connexion directe (voir prisma.config.ts).
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
