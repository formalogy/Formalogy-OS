-- Connexions externes : événements envoyés à Make (client, 02/10/2026).
-- CreateTable
CREATE TABLE "webhooks" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "evenements" TEXT[],
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_envois" (
    "id" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "cle" TEXT NOT NULL,
    "evenement" TEXT NOT NULL,
    "resume" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "erreur" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_envois_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "webhook_envois_webhookId_createdAt_idx" ON "webhook_envois"("webhookId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_envois_webhookId_cle_key" ON "webhook_envois"("webhookId", "cle");

-- AddForeignKey
ALTER TABLE "webhook_envois" ADD CONSTRAINT "webhook_envois_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "webhooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

