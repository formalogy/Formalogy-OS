-- Numéro de dossier CPF (financement personnel) et niveau d'études/diplôme,
-- ajoutés à la fiche apprenant.
ALTER TABLE "learners" ADD COLUMN "niveauEtudes" TEXT;
ALTER TABLE "learners" ADD COLUMN "numeroDossierCpf" TEXT;
