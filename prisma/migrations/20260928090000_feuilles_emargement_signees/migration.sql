-- Feuilles d'émargement signées, une par jour de session (automatisation A-05) :
-- renvoyées par le formateur en réponse à l'email du matin (rangées seules)
-- ou déposées à la main. Leur présence arrête les relances du formateur.
-- CreateEnum
CREATE TYPE "OrigineFeuilleEmargement" AS ENUM ('EMAIL', 'DEPOT');

-- CreateTable
CREATE TABLE "feuilles_emargement_signees" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "jour" TIMESTAMP(3) NOT NULL,
    "documentId" TEXT NOT NULL,
    "origine" "OrigineFeuilleEmargement" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feuilles_emargement_signees_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "feuilles_emargement_signees_documentId_key" ON "feuilles_emargement_signees"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "feuilles_emargement_signees_sessionId_jour_key" ON "feuilles_emargement_signees"("sessionId", "jour");

-- AddForeignKey
ALTER TABLE "feuilles_emargement_signees" ADD CONSTRAINT "feuilles_emargement_signees_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feuilles_emargement_signees" ADD CONSTRAINT "feuilles_emargement_signees_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

