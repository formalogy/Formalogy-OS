-- CreateEnum
CREATE TYPE "TypeFinancement" AS ENUM ('ENTREPRISE', 'OPCO', 'CPF', 'FRANCE_TRAVAIL', 'PERSONNEL', 'AUTRE');

-- CreateEnum
CREATE TYPE "StatutApprenant" AS ENUM ('PROSPECT', 'INSCRIT', 'EN_FORMATION', 'TERMINE', 'ABANDONNE');

-- CreateTable
CREATE TABLE "learners" (
    "id" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "dateNaissance" TIMESTAMP(3),
    "email" TEXT,
    "telephone" TEXT,
    "adresse" TEXT,
    "codePostal" TEXT,
    "ville" TEXT,
    "companyId" TEXT,
    "statut" "StatutApprenant" NOT NULL DEFAULT 'INSCRIT',
    "financement" "TypeFinancement" NOT NULL DEFAULT 'ENTREPRISE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT,

    CONSTRAINT "learners_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "learners_nom_prenom_idx" ON "learners"("nom", "prenom");

-- CreateIndex
CREATE INDEX "learners_companyId_idx" ON "learners"("companyId");

-- CreateIndex
CREATE INDEX "learners_statut_idx" ON "learners"("statut");

-- CreateIndex
CREATE INDEX "learners_deletedAt_idx" ON "learners"("deletedAt");

-- AddForeignKey
ALTER TABLE "learners" ADD CONSTRAINT "learners_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learners" ADD CONSTRAINT "learners_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
