-- La plateforme e-learning se choisit sur la session, pas sur la fiche du
-- stagiaire (client, 01/10/2026) : E-forma ou Mon Parcours En Ligne quand
-- Formalogy gère l'accès, « géré par le formateur » sinon.
ALTER TABLE "learners" DROP COLUMN "plateforme";
ALTER TYPE "PlateformeElearning" ADD VALUE 'FORMATEUR';
ALTER TABLE "sessions" ADD COLUMN "plateforme" "PlateformeElearning";

UPDATE "automations" SET
  "description" = 'Envoie ses identifiants de première connexion à chaque stagiaire d''une session e-learning ou hybride dont l''accès est géré par Formalogy (E-forma ou Mon Parcours En Ligne), le jour du démarrage à 8 h.',
  "updatedAt" = now()
WHERE "nom" = 'Accès à la plateforme en ligne';

UPDATE "email_templates" SET
  "description" = $t$Stagiaire d'une session e-learning ou mixte dont l'accès est géré par Formalogy (E-forma ou Mon Parcours En Ligne, choisi sur la session), le jour du démarrage : identifiants de première connexion. Pas d'envoi quand le formateur gère lui-même l'accès.$t$,
  "updatedAt" = now()
WHERE "code" = 'CONNEXION_PLATEFORME';
