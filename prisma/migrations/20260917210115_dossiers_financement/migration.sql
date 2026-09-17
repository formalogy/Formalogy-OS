-- CreateEnum
CREATE TYPE "TypeFinanceur" AS ENUM ('OPCO', 'FRANCE_TRAVAIL', 'CPF', 'ENTREPRISE', 'AUTRE');

-- CreateEnum
CREATE TYPE "StatutDossier" AS ENUM ('A_MONTER', 'DEPOSE', 'ACCORDE', 'REFUSE', 'ANNULE');

-- AlterEnum
ALTER TYPE "DeclencheurAutomatisation" ADD VALUE 'DOSSIER_SANS_REPONSE';

-- CreateTable
CREATE TABLE "dossiers_financement" (
    "id" TEXT NOT NULL,
    "reference" TEXT,
    "financeurType" "TypeFinanceur" NOT NULL,
    "financeurNom" TEXT NOT NULL,
    "sessionId" TEXT,
    "learnerId" TEXT,
    "companyId" TEXT,
    "montantDemande" DECIMAL(10,2),
    "montantAccorde" DECIMAL(10,2),
    "subrogation" BOOLEAN NOT NULL DEFAULT true,
    "statut" "StatutDossier" NOT NULL DEFAULT 'A_MONTER',
    "dateLimite" TIMESTAMP(3),
    "dateDepot" TIMESTAMP(3),
    "dateReponse" TIMESTAMP(3),
    "motifRefus" TEXT,
    "factureId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "dossiers_financement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dossiers_financement_statut_idx" ON "dossiers_financement"("statut");

-- CreateIndex
CREATE INDEX "dossiers_financement_sessionId_idx" ON "dossiers_financement"("sessionId");

-- CreateIndex
CREATE INDEX "dossiers_financement_dateLimite_idx" ON "dossiers_financement"("dateLimite");

-- AddForeignKey
ALTER TABLE "dossiers_financement" ADD CONSTRAINT "dossiers_financement_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dossiers_financement" ADD CONSTRAINT "dossiers_financement_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "learners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dossiers_financement" ADD CONSTRAINT "dossiers_financement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dossiers_financement" ADD CONSTRAINT "dossiers_financement_factureId_fkey" FOREIGN KEY ("factureId") REFERENCES "factures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dossiers_financement" ADD CONSTRAINT "dossiers_financement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Nouvelle automatisation, livrée DÉSACTIVÉE comme les précédentes.
INSERT INTO "automations" ("id","nom","description","declencheur","parametres","conditions","actions","actif","createdAt","updatedAt")
VALUES (gen_random_uuid()::text,'Relance des dossiers de financement','Crée une tâche quand un dossier déposé reste sans réponse.','DOSSIER_SANS_REPONSE','{"jours": 15}'::jsonb,'{}'::jsonb,'[{"type": "TACHE", "titre": "Relancer le financeur — dossier sans réponse", "delaiJours": 0, "priorite": "NORMALE"}]'::jsonb,false,now(),now());
