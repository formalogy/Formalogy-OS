-- Date d'activation d'une automatisation, pour empêcher tout déclenchement
-- rétroactif sur des sessions déjà terminées au moment où on l'allume.
ALTER TABLE "automations" ADD COLUMN "activeeAt" TIMESTAMP(3);

-- Les automatisations déjà actives sont considérées activées maintenant :
-- elles ne rattraperont donc rien de ce qui précède.
UPDATE "automations" SET "activeeAt" = now() WHERE "actif" = true;
