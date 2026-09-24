-- Logo de l'organisme, repris en tête des documents générés (convocation,
-- attestation, certificat). Seul le chemin du fichier est stocké.
ALTER TABLE "organisme" ADD COLUMN "logoCheminStockage" TEXT;
