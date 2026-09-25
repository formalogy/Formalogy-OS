-- Tarif à l'inscription (décision du client du 25/09/2026) : le tarif de
-- chaque apprenant se saisit en l'inscrivant à une session ; la facture
-- personnelle (dossier CPF, apprenant payeur) reprend ce montant.
ALTER TABLE "session_learners" ADD COLUMN "prixHT" DECIMAL(10,2);

-- Les inscriptions existantes reprennent le prix de leur session.
UPDATE "session_learners" AS i SET "prixHT" = s."prixHT"
FROM "sessions" AS s
WHERE s."id" = i."sessionId" AND i."prixHT" IS NULL;
