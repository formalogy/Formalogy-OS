-- CreateEnum
CREATE TYPE "CategorieDocument" AS ENUM ('APPRENANT', 'ENTREPRISE', 'SESSION', 'FORMATEUR', 'FORMATION', 'FINANCE', 'QUALIOPI');

-- CreateEnum
CREATE TYPE "StatutDocument" AS ENUM ('BROUILLON', 'VALIDE', 'ARCHIVE');

-- CreateTable
CREATE TABLE "document_types" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "categorie" "CategorieDocument" NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "document_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "description" TEXT,
    "typeId" TEXT,
    "categorie" "CategorieDocument" NOT NULL,
    "statut" "StatutDocument" NOT NULL DEFAULT 'VALIDE',
    "learnerId" TEXT,
    "companyId" TEXT,
    "sessionId" TEXT,
    "formationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_versions" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "cheminStockage" TEXT NOT NULL,
    "nomFichier" TEXT NOT NULL,
    "typeMime" TEXT NOT NULL,
    "taille" INTEGER NOT NULL,
    "empreinte" TEXT NOT NULL,
    "commentaire" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "document_types_code_key" ON "document_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "document_types_nom_key" ON "document_types"("nom");

-- CreateIndex
CREATE INDEX "documents_categorie_idx" ON "documents"("categorie");

-- CreateIndex
CREATE INDEX "documents_typeId_idx" ON "documents"("typeId");

-- CreateIndex
CREATE INDEX "documents_learnerId_idx" ON "documents"("learnerId");

-- CreateIndex
CREATE INDEX "documents_companyId_idx" ON "documents"("companyId");

-- CreateIndex
CREATE INDEX "documents_sessionId_idx" ON "documents"("sessionId");

-- CreateIndex
CREATE INDEX "documents_formationId_idx" ON "documents"("formationId");

-- CreateIndex
CREATE INDEX "documents_deletedAt_idx" ON "documents"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "document_versions_cheminStockage_key" ON "document_versions"("cheminStockage");

-- CreateIndex
CREATE UNIQUE INDEX "document_versions_documentId_numero_key" ON "document_versions"("documentId", "numero");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "document_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "learners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_formationId_fkey" FOREIGN KEY ("formationId") REFERENCES "formations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Types de documents initiaux. Le code reconnaît certains d'entre eux par leur
-- « code » (liste de contrôle des sessions, documents manquants) : ne pas
-- renommer ces codes.
INSERT INTO "document_types" ("id", "code", "nom", "categorie", "ordre") VALUES
  (gen_random_uuid()::text, 'CONVENTION',        'Convention de formation',        'SESSION',    1),
  (gen_random_uuid()::text, 'CONTRAT',           'Contrat de formation',           'APPRENANT',  2),
  (gen_random_uuid()::text, 'PROGRAMME',         'Programme',                      'FORMATION',  3),
  (gen_random_uuid()::text, 'CONVOCATION',       'Convocation',                    'SESSION',    4),
  (gen_random_uuid()::text, 'EMARGEMENT',        'Feuille d''émargement',          'SESSION',    5),
  (gen_random_uuid()::text, 'EVALUATION',        'Évaluation des acquis',          'APPRENANT',  6),
  (gen_random_uuid()::text, 'SATISFACTION',      'Questionnaire de satisfaction',  'APPRENANT',  7),
  (gen_random_uuid()::text, 'ATTESTATION',       'Attestation de formation',       'APPRENANT',  8),
  (gen_random_uuid()::text, 'CERTIFICAT',        'Certificat',                     'APPRENANT',  9),
  (gen_random_uuid()::text, 'DEVIS',             'Devis',                          'FINANCE',   10),
  (gen_random_uuid()::text, 'FACTURE',           'Facture',                        'FINANCE',   11),
  (gen_random_uuid()::text, 'ACCORD_FINANCEMENT','Accord de prise en charge',      'FINANCE',   12),
  (gen_random_uuid()::text, 'CV_FORMATEUR',      'CV formateur',                   'FORMATEUR', 13),
  (gen_random_uuid()::text, 'CONTRAT_FORMATEUR', 'Contrat formateur',              'FORMATEUR', 14),
  (gen_random_uuid()::text, 'PREUVE_QUALIOPI',   'Preuve Qualiopi',                'QUALIOPI',  15),
  (gen_random_uuid()::text, 'AUTRE',             'Autre',                          'ENTREPRISE',16);
