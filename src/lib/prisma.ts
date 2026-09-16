import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

// Point d'accès unique à la base de données, réservé au code serveur.
//
// La connexion est ouverte au premier usage réel, pas au chargement du module :
// certains outils (génération de schéma, analyse de code) importent ce fichier
// sans jamais interroger la base, et doivent fonctionner même quand la
// connexion n'est pas encore configurée.
//
// En développement, Next.js recharge les modules à chaque modification :
// l'instance est conservée sur globalThis pour ne pas rouvrir une connexion
// à chaque rechargement.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function getClient(): PrismaClient {
  if (globalForPrisma.prisma) {
    return globalForPrisma.prisma;
  }

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL est absente. Copie .env.example vers .env et renseigne la connexion Supabase.",
    );
  }

  // L'application passe par le pooler Supabase ; les migrations, elles,
  // utilisent la connexion directe (voir prisma.config.ts).
  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  globalForPrisma.prisma = client;
  return client;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property, receiver) {
    return Reflect.get(getClient(), property, receiver);
  },
});
