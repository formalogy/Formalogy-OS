-- CreateEnum
CREATE TYPE "StatutProspect" AS ENUM ('NOUVEAU', 'A_CONTACTER', 'CONTACTE', 'RELANCE', 'PROPOSITION_ENVOYEE', 'NEGOCIATION', 'GAGNE', 'PERDU');

-- CreateEnum
CREATE TYPE "SourceProspect" AS ENUM ('SITE_INTERNET', 'CPF', 'RECOMMANDATION', 'PROSPECTION', 'EMAIL', 'TELEPHONE', 'PARTENAIRE', 'AUTRE');

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "raisonSociale" TEXT NOT NULL,
    "siret" TEXT,
    "adresse" TEXT,
    "codePostal" TEXT,
    "ville" TEXT,
    "telephone" TEXT,
    "email" TEXT,
    "siteWeb" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "fonction" TEXT,
    "email" TEXT,
    "telephone" TEXT,
    "notes" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prospects" (
    "id" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "email" TEXT,
    "telephone" TEXT,
    "companyId" TEXT,
    "entreprise" TEXT,
    "source" "SourceProspect" NOT NULL DEFAULT 'AUTRE',
    "statut" "StatutProspect" NOT NULL DEFAULT 'NOUVEAU',
    "montantPotentiel" DECIMAL(10,2),
    "derniereInteractionAt" TIMESTAMP(3),
    "prochaineRelanceAt" TIMESTAMP(3),
    "notes" TEXT,
    "commercialId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT,

    CONSTRAINT "prospects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "companies_raisonSociale_idx" ON "companies"("raisonSociale");

-- CreateIndex
CREATE INDEX "companies_deletedAt_idx" ON "companies"("deletedAt");

-- CreateIndex
CREATE INDEX "contacts_companyId_idx" ON "contacts"("companyId");

-- CreateIndex
CREATE INDEX "contacts_deletedAt_idx" ON "contacts"("deletedAt");

-- CreateIndex
CREATE INDEX "prospects_statut_idx" ON "prospects"("statut");

-- CreateIndex
CREATE INDEX "prospects_prochaineRelanceAt_idx" ON "prospects"("prochaineRelanceAt");

-- CreateIndex
CREATE INDEX "prospects_companyId_idx" ON "prospects"("companyId");

-- CreateIndex
CREATE INDEX "prospects_deletedAt_idx" ON "prospects"("deletedAt");

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_commercialId_fkey" FOREIGN KEY ("commercialId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
