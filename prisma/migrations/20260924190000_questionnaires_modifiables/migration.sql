-- Questionnaires modifiables depuis l'application.
-- Aucune réponse n'existait encore au moment de cette migration : le nouveau
-- format des réponses (par identifiant de question) ne demande aucune reprise.

CREATE TABLE "modeles_questionnaire" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "introduction" TEXT,
    "questions" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "modeles_questionnaire_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "modeles_questionnaire_code_key" ON "modeles_questionnaire"("code");

-- Questions telles qu'elles ont été posées, figées au moment de la réponse.
ALTER TABLE "questionnaires" ADD COLUMN "questions" JSONB;
ALTER TABLE "questionnaires_satisfaction" ADD COLUMN "questions" JSONB;
