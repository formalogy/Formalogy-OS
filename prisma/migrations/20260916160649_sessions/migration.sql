-- CreateEnum
CREATE TYPE "StatutSession" AS ENUM ('BROUILLON', 'A_PREPARER', 'DOCUMENTS_EN_ATTENTE', 'PRETE', 'EN_COURS', 'TERMINEE', 'CLOTUREE', 'ANNULEE');

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "formationId" TEXT NOT NULL,
    "companyId" TEXT,
    "dateDebut" TIMESTAMP(3) NOT NULL,
    "dateFin" TIMESTAMP(3) NOT NULL,
    "horaires" TEXT,
    "lieu" TEXT,
    "modalite" "ModaliteFormation" NOT NULL,
    "statut" "StatutSession" NOT NULL DEFAULT 'BROUILLON',
    "intervenant" TEXT,
    "placesMax" INTEGER,
    "prixHT" DECIMAL(10,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_learners" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "learnerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_learners_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sessions_numero_key" ON "sessions"("numero");

-- CreateIndex
CREATE INDEX "sessions_dateDebut_dateFin_idx" ON "sessions"("dateDebut", "dateFin");

-- CreateIndex
CREATE INDEX "sessions_statut_idx" ON "sessions"("statut");

-- CreateIndex
CREATE INDEX "sessions_formationId_idx" ON "sessions"("formationId");

-- CreateIndex
CREATE INDEX "sessions_companyId_idx" ON "sessions"("companyId");

-- CreateIndex
CREATE INDEX "sessions_deletedAt_idx" ON "sessions"("deletedAt");

-- CreateIndex
CREATE INDEX "session_learners_learnerId_idx" ON "session_learners"("learnerId");

-- CreateIndex
CREATE UNIQUE INDEX "session_learners_sessionId_learnerId_key" ON "session_learners"("sessionId", "learnerId");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_formationId_fkey" FOREIGN KEY ("formationId") REFERENCES "formations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_learners" ADD CONSTRAINT "session_learners_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_learners" ADD CONSTRAINT "session_learners_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "learners"("id") ON DELETE CASCADE ON UPDATE CASCADE;
