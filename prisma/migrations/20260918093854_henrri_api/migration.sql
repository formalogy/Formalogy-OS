-- AlterEnum
CREATE TYPE "OrigineFacture" AS ENUM ('MANUEL', 'AUTO');

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "henrriCustomerId" INTEGER;

-- AlterTable
ALTER TABLE "learners" ADD COLUMN     "henrriCustomerId" INTEGER;

-- AlterTable
ALTER TABLE "factures" ADD COLUMN     "origine" "OrigineFacture" NOT NULL DEFAULT 'MANUEL';

-- CreateIndex
CREATE UNIQUE INDEX "companies_henrriCustomerId_key" ON "companies"("henrriCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "learners_henrriCustomerId_key" ON "learners"("henrriCustomerId");

-- Nouvelle automatisation, livrée DÉSACTIVÉE comme les précédentes : son
-- activation est une décision du client (voir CLAUDE.md).
INSERT INTO "automations" ("id","nom","description","declencheur","parametres","conditions","actions","actif","createdAt","updatedAt")
VALUES (gen_random_uuid()::text,'Facturation automatique (Henrri)','Émet la facture dans Henrri dès qu''une session passe à Terminée ou Clôturée, et range son PDF dans les documents de la session.','SESSION_TERMINEE','{}'::jsonb,'{}'::jsonb,'[{"type": "FACTURE_HENRRI"}]'::jsonb,false,now(),now());
