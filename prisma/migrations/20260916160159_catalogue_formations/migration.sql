-- CreateEnum
CREATE TYPE "ModaliteFormation" AS ENUM ('PRESENTIEL', 'DISTANCIEL', 'E_LEARNING', 'HYBRIDE');

-- CreateEnum
CREATE TYPE "StatutFormation" AS ENUM ('BROUILLON', 'ACTIVE', 'ARCHIVEE');

-- CreateTable
CREATE TABLE "formation_categories" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "formation_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "formations" (
    "id" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "categoryId" TEXT,
    "description" TEXT,
    "objectifs" TEXT,
    "programme" TEXT,
    "prerequis" TEXT,
    "publicVise" TEXT,
    "competences" TEXT,
    "certification" TEXT,
    "dureeHeures" DECIMAL(6,2),
    "dureeJours" DECIMAL(4,1),
    "prixHT" DECIMAL(10,2),
    "modalite" "ModaliteFormation" NOT NULL DEFAULT 'PRESENTIEL',
    "statut" "StatutFormation" NOT NULL DEFAULT 'BROUILLON',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT,

    CONSTRAINT "formations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "formation_categories_nom_key" ON "formation_categories"("nom");

-- CreateIndex
CREATE UNIQUE INDEX "formations_reference_key" ON "formations"("reference");

-- CreateIndex
CREATE INDEX "formations_categoryId_idx" ON "formations"("categoryId");

-- CreateIndex
CREATE INDEX "formations_statut_idx" ON "formations"("statut");

-- CreateIndex
CREATE INDEX "formations_deletedAt_idx" ON "formations"("deletedAt");

-- AddForeignKey
ALTER TABLE "formations" ADD CONSTRAINT "formations_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "formation_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formations" ADD CONSTRAINT "formations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Catégories initiales du catalogue (cahier des charges, section 11)
INSERT INTO "formation_categories" ("id", "nom", "ordre") VALUES
  (gen_random_uuid()::text, 'Bureautique', 1),
  (gen_random_uuid()::text, 'Langues', 2),
  (gen_random_uuid()::text, 'Management', 3),
  (gen_random_uuid()::text, 'RH', 4),
  (gen_random_uuid()::text, 'Comptabilité', 5),
  (gen_random_uuid()::text, 'Infographie', 6),
  (gen_random_uuid()::text, 'CAO/DAO', 7),
  (gen_random_uuid()::text, 'Web', 8),
  (gen_random_uuid()::text, 'Marketing', 9),
  (gen_random_uuid()::text, 'Sécurité', 10),
  (gen_random_uuid()::text, 'Santé', 11),
  (gen_random_uuid()::text, 'Productivité', 12);
