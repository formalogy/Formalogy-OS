-- Catalogue de formation enrichi (client, 05/10/2026) : certification, méthodes, évaluation, accessibilité, horaires, plateforme e-learning, formateurs habituels.
-- CreateEnum
CREATE TYPE "TypeCertification" AS ENUM ('AUCUNE', 'RS', 'RNCP');

-- AlterTable
ALTER TABLE "formations" ADD COLUMN     "accessibilite" TEXT,
ADD COLUMN     "dureeAccesMois" INTEGER,
ADD COLUMN     "evaluation" TEXT,
ADD COLUMN     "horaires" TEXT,
ADD COLUMN     "methodes" TEXT,
ADD COLUMN     "niveauCertification" TEXT,
ADD COLUMN     "plateforme" "PlateformeElearning",
ADD COLUMN     "typeCertification" "TypeCertification";

-- CreateTable
CREATE TABLE "_FormateursHabituels" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_FormateursHabituels_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_FormateursHabituels_B_index" ON "_FormateursHabituels"("B");

-- AddForeignKey
ALTER TABLE "_FormateursHabituels" ADD CONSTRAINT "_FormateursHabituels_A_fkey" FOREIGN KEY ("A") REFERENCES "formations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_FormateursHabituels" ADD CONSTRAINT "_FormateursHabituels_B_fkey" FOREIGN KEY ("B") REFERENCES "trainers"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Reprise de l'existant : un formateur qui a un programme rattaché à une
-- formation en devient formateur habituel.
INSERT INTO "_FormateursHabituels" ("A", "B")
SELECT DISTINCT d."formationId", d."trainerId"
FROM "documents" d JOIN "document_types" t ON t."id" = d."typeId"
WHERE t."code" = 'PROGRAMME' AND d."deletedAt" IS NULL AND d."formationId" IS NOT NULL AND d."trainerId" IS NOT NULL
ON CONFLICT DO NOTHING;

-- Type de certification déduit du texte déjà saisi.
UPDATE "formations" SET "typeCertification" = CASE
  WHEN "certification" ~* '(RNCP|titre professionnel)' THEN 'RNCP'::"TypeCertification"
  WHEN "certification" ~* '(\mRS\M|r[ée]pertoire sp[ée]cifique|TOSA|ICDL|PCIE)' THEN 'RS'::"TypeCertification"
  ELSE NULL END
WHERE "certification" IS NOT NULL AND trim("certification") <> '';
