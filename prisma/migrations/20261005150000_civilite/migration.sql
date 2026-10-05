-- Civilité du stagiaire, reprise dans la convention (client, 05/10/2026).
CREATE TYPE "Civilite" AS ENUM ('MONSIEUR', 'MADAME');
ALTER TABLE "learners" ADD COLUMN "civilite" "Civilite";
