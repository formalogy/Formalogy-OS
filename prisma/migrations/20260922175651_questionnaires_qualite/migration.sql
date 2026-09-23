-- Questionnaires qualité (positionnement, à chaud formateur, à froid,
-- financeur, satisfaction formateur annuelle) : distincts du questionnaire
-- de satisfaction apprenant existant, destinataire et questions variables.
CREATE TYPE "TypeQuestionnaire" AS ENUM ('POSITIONNEMENT', 'CHAUD_FORMATEUR', 'FROID', 'FINANCEUR', 'SATISFACTION_FORMATEUR');

CREATE TABLE "questionnaires" (
    "id" TEXT NOT NULL,
    "type" "TypeQuestionnaire" NOT NULL,
    "sessionId" TEXT,
    "learnerId" TEXT,
    "trainerId" TEXT,
    "dossierFinancementId" TEXT,
    "jetonEmpreinte" TEXT NOT NULL,
    "expireAt" TIMESTAMP(3) NOT NULL,
    "envoyeAt" TIMESTAMP(3),
    "reponduAt" TIMESTAMP(3),
    "reponses" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "questionnaires_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "questionnaires_jetonEmpreinte_key" ON "questionnaires"("jetonEmpreinte");
CREATE INDEX "questionnaires_type_idx" ON "questionnaires"("type");
CREATE INDEX "questionnaires_sessionId_idx" ON "questionnaires"("sessionId");
CREATE INDEX "questionnaires_reponduAt_idx" ON "questionnaires"("reponduAt");

ALTER TABLE "questionnaires" ADD CONSTRAINT "questionnaires_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "questionnaires" ADD CONSTRAINT "questionnaires_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "learners"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "questionnaires" ADD CONSTRAINT "questionnaires_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "trainers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "questionnaires" ADD CONSTRAINT "questionnaires_dossierFinancementId_fkey" FOREIGN KEY ("dossierFinancementId") REFERENCES "dossiers_financement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Adresse du contact chez le financeur, pour l'envoi du questionnaire annuel.
ALTER TABLE "dossiers_financement" ADD COLUMN "email" TEXT;
