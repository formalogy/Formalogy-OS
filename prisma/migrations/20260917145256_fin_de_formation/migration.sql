-- CreateEnum
CREATE TYPE "ResultatAcquis" AS ENUM ('ACQUIS', 'PARTIELLEMENT_ACQUIS', 'NON_ACQUIS');

-- CreateTable
CREATE TABLE "organisme" (
    "id" TEXT NOT NULL DEFAULT 'organisme',
    "raisonSociale" TEXT NOT NULL,
    "siret" TEXT,
    "numeroDeclaration" TEXT,
    "adresse" TEXT,
    "codePostal" TEXT,
    "ville" TEXT,
    "telephone" TEXT,
    "email" TEXT,
    "siteWeb" TEXT,
    "representantNom" TEXT,
    "representantFonction" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organisme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluations_acquis" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "learnerId" TEXT NOT NULL,
    "resultat" "ResultatAcquis" NOT NULL,
    "commentaire" TEXT,
    "saisieParId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evaluations_acquis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questionnaires_satisfaction" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "learnerId" TEXT NOT NULL,
    "jetonEmpreinte" TEXT NOT NULL,
    "expireAt" TIMESTAMP(3) NOT NULL,
    "envoyeAt" TIMESTAMP(3),
    "reponduAt" TIMESTAMP(3),
    "reponses" JSONB,
    "noteGlobale" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "questionnaires_satisfaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "evaluations_acquis_sessionId_learnerId_key" ON "evaluations_acquis"("sessionId", "learnerId");

-- CreateIndex
CREATE UNIQUE INDEX "questionnaires_satisfaction_jetonEmpreinte_key" ON "questionnaires_satisfaction"("jetonEmpreinte");

-- CreateIndex
CREATE INDEX "questionnaires_satisfaction_reponduAt_idx" ON "questionnaires_satisfaction"("reponduAt");

-- CreateIndex
CREATE UNIQUE INDEX "questionnaires_satisfaction_sessionId_learnerId_key" ON "questionnaires_satisfaction"("sessionId", "learnerId");

-- AddForeignKey
ALTER TABLE "evaluations_acquis" ADD CONSTRAINT "evaluations_acquis_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations_acquis" ADD CONSTRAINT "evaluations_acquis_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "learners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations_acquis" ADD CONSTRAINT "evaluations_acquis_saisieParId_fkey" FOREIGN KEY ("saisieParId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questionnaires_satisfaction" ADD CONSTRAINT "questionnaires_satisfaction_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questionnaires_satisfaction" ADD CONSTRAINT "questionnaires_satisfaction_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "learners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Ligne unique de l'organisme, pré-remplie avec le nom actuel.
INSERT INTO "organisme" ("id", "raisonSociale", "updatedAt") VALUES ('organisme', 'Formalogy', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
