-- Facturation par inscription (décision du client du 25/09/2026) : à
-- l'inscription, on choisit à qui facturer (entreprise qui finance
-- elle-même, OPCO ou France Travail en subrogation, Caisse des Dépôts pour
-- le CPF, apprenant). Les factures se regroupent ensuite par payeur.

-- 1. Clients Henrri des financeurs tiers, retrouvés par leur nom.
CREATE TABLE "clients_henrri_financeurs" (
    "id" TEXT NOT NULL,
    "cle" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "henrriCustomerId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clients_henrri_financeurs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "clients_henrri_financeurs_cle_key" ON "clients_henrri_financeurs"("cle");

-- Le client « Caisse des Dépôts » déjà créé est repris, puis l'ancien
-- emplacement disparaît.
INSERT INTO "clients_henrri_financeurs" ("id", "cle", "nom", "henrriCustomerId")
SELECT gen_random_uuid()::text, 'caisse des dépôts et consignations', 'Caisse des Dépôts et Consignations', "henrriCaisseDepotsId"
FROM "organisme" WHERE "henrriCaisseDepotsId" IS NOT NULL LIMIT 1;
ALTER TABLE "organisme" DROP COLUMN "henrriCaisseDepotsId";

-- 2. Payeur de chaque inscription, déduit du financement de l'apprenant pour
--    les inscriptions existantes. Un financement « entreprise » sans aucune
--    entreprise rattachée est facturé à l'apprenant.
ALTER TABLE "session_learners" ADD COLUMN "facturerA" "TypePayeur",
ADD COLUMN "dossierFinancementId" TEXT,
ADD COLUMN "factureId" TEXT;

UPDATE "session_learners" AS i SET "facturerA" = CASE
    WHEN l."financement" = 'CPF' THEN 'CAISSE_DES_DEPOTS'::"TypePayeur"
    WHEN l."financement" = 'OPCO' THEN 'OPCO'::"TypePayeur"
    WHEN l."financement" = 'FRANCE_TRAVAIL' THEN 'FRANCE_TRAVAIL'::"TypePayeur"
    WHEN l."financement" = 'ENTREPRISE' AND (l."companyId" IS NOT NULL OR s."companyId" IS NOT NULL) THEN 'ENTREPRISE'::"TypePayeur"
    ELSE 'APPRENANT'::"TypePayeur"
  END
FROM "learners" AS l, "sessions" AS s
WHERE l."id" = i."learnerId" AND s."id" = i."sessionId";

ALTER TABLE "session_learners" ALTER COLUMN "facturerA" SET NOT NULL;

CREATE UNIQUE INDEX "session_learners_dossierFinancementId_key" ON "session_learners"("dossierFinancementId");
CREATE INDEX "session_learners_factureId_idx" ON "session_learners"("factureId");
ALTER TABLE "session_learners" ADD CONSTRAINT "session_learners_dossierFinancementId_fkey" FOREIGN KEY ("dossierFinancementId") REFERENCES "dossiers_financement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "session_learners" ADD CONSTRAINT "session_learners_factureId_fkey" FOREIGN KEY ("factureId") REFERENCES "factures"("id") ON DELETE SET NULL ON UPDATE CASCADE;
