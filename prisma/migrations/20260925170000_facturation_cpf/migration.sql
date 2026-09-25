-- Facturation CPF (décision du client du 25/09/2026) : les dossiers CPF se
-- facturent à la Caisse des Dépôts, une facture par dossier (EDOF facture
-- dossier par dossier), avec l'identité de l'apprenant, son numéro de
-- dossier et le numéro de l'offre dans le corps de la facture.
ALTER TABLE "learners" ADD COLUMN "numeroOffreCpf" TEXT;
ALTER TABLE "organisme" ADD COLUMN "henrriCaisseDepotsId" INTEGER;
ALTER TYPE "TypePayeur" ADD VALUE 'CAISSE_DES_DEPOTS';
