-- Chaque formateur a ses programmes (documents PROGRAMME rattachés à sa
-- fiche) ; la session choisit le sien, joint aux emails de bienvenue
-- (client, 01/10/2026).
ALTER TABLE "sessions" ADD COLUMN "programmeId" TEXT;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
