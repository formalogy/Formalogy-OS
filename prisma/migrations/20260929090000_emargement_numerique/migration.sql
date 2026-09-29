-- Émargement numérique (décision du client du 29/09/2026, sur le modèle
-- qu'il a fourni) : chaque participant signe chaque demi-journée par son lien
-- personnel ou un QR code ; la signature et ses éléments de preuve sont
-- conservés. Nouveau déclencheur « fin de demi-journée » pour relancer qui
-- n'a pas émargé.
-- AlterEnum
ALTER TYPE "DeclencheurAutomatisation" ADD VALUE 'FIN_DEMI_JOURNEE';

-- AlterEnum
ALTER TYPE "OrigineFeuilleEmargement" ADD VALUE 'NUMERIQUE';

-- CreateTable
CREATE TABLE "liens_emargement" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "learnerId" TEXT,
    "trainerId" TEXT,
    "jetonEmpreinte" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "liens_emargement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signatures_emargement" (
    "id" TEXT NOT NULL,
    "lienId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "jour" TIMESTAMP(3) NOT NULL,
    "creneau" "Creneau" NOT NULL,
    "image" BYTEA NOT NULL,
    "empreinte" TEXT NOT NULL,
    "signeAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "appareil" TEXT,

    CONSTRAINT "signatures_emargement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "liens_emargement_jetonEmpreinte_key" ON "liens_emargement"("jetonEmpreinte");

-- CreateIndex
CREATE UNIQUE INDEX "liens_emargement_sessionId_learnerId_key" ON "liens_emargement"("sessionId", "learnerId");

-- CreateIndex
CREATE UNIQUE INDEX "liens_emargement_sessionId_trainerId_key" ON "liens_emargement"("sessionId", "trainerId");

-- CreateIndex
CREATE INDEX "signatures_emargement_sessionId_jour_idx" ON "signatures_emargement"("sessionId", "jour");

-- CreateIndex
CREATE UNIQUE INDEX "signatures_emargement_lienId_jour_creneau_key" ON "signatures_emargement"("lienId", "jour", "creneau");

-- AddForeignKey
ALTER TABLE "liens_emargement" ADD CONSTRAINT "liens_emargement_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liens_emargement" ADD CONSTRAINT "liens_emargement_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "learners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liens_emargement" ADD CONSTRAINT "liens_emargement_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "trainers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signatures_emargement" ADD CONSTRAINT "signatures_emargement_lienId_fkey" FOREIGN KEY ("lienId") REFERENCES "liens_emargement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signatures_emargement" ADD CONSTRAINT "signatures_emargement_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

