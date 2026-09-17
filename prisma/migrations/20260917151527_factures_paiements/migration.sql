-- CreateEnum
CREATE TYPE "TypePayeur" AS ENUM ('ENTREPRISE', 'OPCO', 'APPRENANT', 'FRANCE_TRAVAIL', 'AUTRE');

-- CreateEnum
CREATE TYPE "StatutFacture" AS ENUM ('A_EMETTRE', 'EMISE', 'PAYEE', 'ANNULEE');

-- CreateEnum
CREATE TYPE "MoyenPaiement" AS ENUM ('VIREMENT', 'CHEQUE', 'CARTE', 'PRELEVEMENT', 'ESPECES', 'AUTRE');

-- CreateTable
CREATE TABLE "factures" (
    "id" TEXT NOT NULL,
    "numero" TEXT,
    "henrriId" TEXT,
    "objet" TEXT NOT NULL,
    "sessionId" TEXT,
    "companyId" TEXT,
    "learnerId" TEXT,
    "payeurType" "TypePayeur" NOT NULL,
    "payeurNom" TEXT NOT NULL,
    "montantHT" DECIMAL(10,2) NOT NULL,
    "tauxTva" DECIMAL(4,2) NOT NULL,
    "montantTTC" DECIMAL(10,2) NOT NULL,
    "statut" "StatutFacture" NOT NULL DEFAULT 'A_EMETTRE',
    "dateEmission" TIMESTAMP(3),
    "dateEcheance" TIMESTAMP(3),
    "annuleeAt" TIMESTAMP(3),
    "documentId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "factures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paiements" (
    "id" TEXT NOT NULL,
    "factureId" TEXT NOT NULL,
    "montant" DECIMAL(10,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "moyen" "MoyenPaiement" NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "paiements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "factures_numero_key" ON "factures"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "factures_henrriId_key" ON "factures"("henrriId");

-- CreateIndex
CREATE INDEX "factures_statut_idx" ON "factures"("statut");

-- CreateIndex
CREATE INDEX "factures_sessionId_idx" ON "factures"("sessionId");

-- CreateIndex
CREATE INDEX "factures_companyId_idx" ON "factures"("companyId");

-- CreateIndex
CREATE INDEX "factures_dateEcheance_idx" ON "factures"("dateEcheance");

-- CreateIndex
CREATE INDEX "paiements_factureId_idx" ON "paiements"("factureId");

-- CreateIndex
CREATE INDEX "paiements_date_idx" ON "paiements"("date");

-- AddForeignKey
ALTER TABLE "factures" ADD CONSTRAINT "factures_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factures" ADD CONSTRAINT "factures_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factures" ADD CONSTRAINT "factures_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "learners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factures" ADD CONSTRAINT "factures_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factures" ADD CONSTRAINT "factures_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paiements" ADD CONSTRAINT "paiements_factureId_fkey" FOREIGN KEY ("factureId") REFERENCES "factures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paiements" ADD CONSTRAINT "paiements_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
