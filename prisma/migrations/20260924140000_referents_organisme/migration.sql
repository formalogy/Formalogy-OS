-- Référents nommés sur la convocation : handicap (exigence Qualiopi,
-- indicateur 26), administratif et RGPD. Sans eux, la convocation ne peut
-- pas indiquer à l'apprenant qui contacter.
ALTER TABLE "organisme"
  ADD COLUMN "referentHandicapNom" TEXT,
  ADD COLUMN "referentHandicapEmail" TEXT,
  ADD COLUMN "referentHandicapTelephone" TEXT,
  ADD COLUMN "referentAdministratifNom" TEXT,
  ADD COLUMN "referentAdministratifEmail" TEXT,
  ADD COLUMN "referentAdministratifTelephone" TEXT,
  ADD COLUMN "referentRgpdNom" TEXT,
  ADD COLUMN "referentRgpdEmail" TEXT;
