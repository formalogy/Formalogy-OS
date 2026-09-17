-- CreateEnum
CREATE TYPE "StatutSignature" AS ENUM ('A_ENVOYER', 'ENVOYEE', 'SIGNEE', 'ANNULEE');

-- CreateEnum
CREATE TYPE "OrigineSignature" AS ENUM ('EMAIL', 'MANUEL');

-- CreateEnum
CREATE TYPE "ResultatEmailEntrant" AS ENUM ('RAPPROCHE', 'IGNORE', 'A_VERIFIER');

-- CreateTable
CREATE TABLE "signature_requests" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "versionSourceId" TEXT NOT NULL,
    "statut" "StatutSignature" NOT NULL DEFAULT 'A_ENVOYER',
    "signataires" JSONB NOT NULL,
    "envoyeeAt" TIMESTAMP(3),
    "signeeAt" TIMESTAMP(3),
    "annuleeAt" TIMESTAMP(3),
    "versionSigneeId" TEXT,
    "origine" "OrigineSignature",
    "preuveChemin" TEXT,
    "preuveNomFichier" TEXT,
    "preuveTaille" INTEGER,
    "preuveEmpreinte" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "signature_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emails_entrants" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "expediteur" TEXT NOT NULL,
    "sujet" TEXT NOT NULL,
    "recuAt" TIMESTAMP(3) NOT NULL,
    "resultat" "ResultatEmailEntrant" NOT NULL,
    "motif" TEXT,
    "signatureRequestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "emails_entrants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "signature_requests_reference_key" ON "signature_requests"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "signature_requests_versionSigneeId_key" ON "signature_requests"("versionSigneeId");

-- CreateIndex
CREATE UNIQUE INDEX "signature_requests_preuveChemin_key" ON "signature_requests"("preuveChemin");

-- CreateIndex
CREATE INDEX "signature_requests_statut_idx" ON "signature_requests"("statut");

-- CreateIndex
CREATE INDEX "signature_requests_documentId_idx" ON "signature_requests"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "emails_entrants_messageId_key" ON "emails_entrants"("messageId");

-- CreateIndex
CREATE INDEX "emails_entrants_resultat_idx" ON "emails_entrants"("resultat");

-- AddForeignKey
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_versionSourceId_fkey" FOREIGN KEY ("versionSourceId") REFERENCES "document_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_versionSigneeId_fkey" FOREIGN KEY ("versionSigneeId") REFERENCES "document_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
