-- Le tarif journalier HT n'était renseigné pour aucun formateur : la case
-- devient un taux de commissionnement (%), rempli par le client lui-même.
ALTER TABLE "trainers" RENAME COLUMN "tarifJournalierHT" TO "tauxCommissionnement";
ALTER TABLE "trainers" ALTER COLUMN "tauxCommissionnement" TYPE DECIMAL(5,2);
