-- A-13, A-14, A-15 (décisions du client du 29/09/2026) : rappel avant
-- l'audit Qualiopi, synthèse hebdomadaire aux formateurs, devis Henrri
-- repris dans l'application pour être comptés et relancés.

-- CreateEnum
CREATE TYPE "StatutDevis" AS ENUM ('EN_ATTENTE', 'ACCEPTE', 'REFUSE', 'SANS_SUITE');

-- AlterEnum


ALTER TYPE "DeclencheurAutomatisation" ADD VALUE 'AVANT_AUDIT_QUALIOPI';
ALTER TYPE "DeclencheurAutomatisation" ADD VALUE 'HEBDOMADAIRE';
ALTER TYPE "DeclencheurAutomatisation" ADD VALUE 'DEVIS_EN_ATTENTE';

-- CreateTable
CREATE TABLE "devis" (
    "id" TEXT NOT NULL,
    "henrriId" INTEGER NOT NULL,
    "numero" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "objet" TEXT,
    "henrriCustomerId" INTEGER,
    "clientNom" TEXT NOT NULL,
    "contactNom" TEXT,
    "email" TEXT,
    "montantHT" DECIMAL(10,2) NOT NULL,
    "montantTTC" DECIMAL(10,2) NOT NULL,
    "learnerId" TEXT,
    "companyId" TEXT,
    "prospectId" TEXT,
    "statut" "StatutDevis" NOT NULL DEFAULT 'EN_ATTENTE',
    "motifStatut" TEXT,
    "statutAt" TIMESTAMP(3),
    "relances" INTEGER NOT NULL DEFAULT 0,
    "derniereRelanceAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "devis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "devis_henrriId_key" ON "devis"("henrriId");

-- CreateIndex
CREATE INDEX "devis_statut_idx" ON "devis"("statut");

-- CreateIndex
CREATE INDEX "devis_date_idx" ON "devis"("date");

-- CreateIndex
CREATE INDEX "devis_learnerId_idx" ON "devis"("learnerId");

-- CreateIndex
CREATE INDEX "devis_companyId_idx" ON "devis"("companyId");

-- CreateIndex
CREATE INDEX "devis_prospectId_idx" ON "devis"("prospectId");

-- AddForeignKey
ALTER TABLE "devis" ADD CONSTRAINT "devis_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "learners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devis" ADD CONSTRAINT "devis_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devis" ADD CONSTRAINT "devis_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "prospects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

