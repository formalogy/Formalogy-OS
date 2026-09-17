-- CreateEnum
CREATE TYPE "Creneau" AS ENUM ('MATIN', 'APRES_MIDI');

-- CreateEnum
CREATE TYPE "StatutPresence" AS ENUM ('PRESENT', 'ABSENT', 'ABSENT_JUSTIFIE');

-- CreateTable
CREATE TABLE "presences" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "learnerId" TEXT NOT NULL,
    "jour" TIMESTAMP(3) NOT NULL,
    "creneau" "Creneau" NOT NULL,
    "statut" "StatutPresence" NOT NULL,
    "saisieParId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "presences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "presences_learnerId_idx" ON "presences"("learnerId");

-- CreateIndex
CREATE UNIQUE INDEX "presences_sessionId_learnerId_jour_creneau_key" ON "presences"("sessionId", "learnerId", "jour", "creneau");

-- AddForeignKey
ALTER TABLE "presences" ADD CONSTRAINT "presences_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presences" ADD CONSTRAINT "presences_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "learners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presences" ADD CONSTRAINT "presences_saisieParId_fkey" FOREIGN KEY ("saisieParId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
