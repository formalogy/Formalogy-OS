-- Formateur qui forme au sein de l entreprise cliente (client, 02/10/2026) :
-- le lieu de ses sessions est l adresse de la fiche de l entreprise.
ALTER TABLE "trainers" ADD COLUMN "lieuEntreprise" BOOLEAN NOT NULL DEFAULT false;
