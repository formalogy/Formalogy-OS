/*
  Warnings:

  - You are about to drop the column `intervenant` on the `sessions` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "StatutFormateur" AS ENUM ('INDEPENDANT', 'SALARIE', 'SOUS_TRAITANT');

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "trainerId" TEXT;

-- AlterTable
ALTER TABLE "sessions" DROP COLUMN "intervenant",
ADD COLUMN     "trainerId" TEXT;

-- CreateTable
CREATE TABLE "trainers" (
    "id" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "email" TEXT,
    "telephone" TEXT,
    "statut" "StatutFormateur" NOT NULL DEFAULT 'INDEPENDANT',
    "siret" TEXT,
    "specialites" TEXT,
    "tarifJournalierHT" DECIMAL(10,2),
    "notes" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT,

    CONSTRAINT "trainers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "trainers_userId_key" ON "trainers"("userId");

-- CreateIndex
CREATE INDEX "trainers_nom_prenom_idx" ON "trainers"("nom", "prenom");

-- CreateIndex
CREATE INDEX "trainers_deletedAt_idx" ON "trainers"("deletedAt");

-- CreateIndex
CREATE INDEX "documents_trainerId_idx" ON "documents"("trainerId");

-- CreateIndex
CREATE INDEX "sessions_trainerId_idx" ON "sessions"("trainerId");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "trainers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "trainers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainers" ADD CONSTRAINT "trainers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainers" ADD CONSTRAINT "trainers_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
