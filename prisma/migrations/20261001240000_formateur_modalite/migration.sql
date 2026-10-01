-- Modalité habituelle du formateur (client, 01/10/2026) : la plupart
-- travaillent en présentiel ; seules les formations propres à Formalogy sont
-- en ligne.
ALTER TABLE "trainers" ADD COLUMN "modalite" "ModaliteFormation";
