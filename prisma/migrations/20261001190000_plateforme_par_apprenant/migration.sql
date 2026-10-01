-- La plateforme e-learning se choisit sur la fiche du stagiaire, pas sur la
-- formation (client, 01/10/2026) : « aucune » quand le formateur gère
-- lui-même l'accès. Le champ de la formation, jamais rempli, disparaît.
ALTER TABLE "formations" DROP COLUMN "plateforme";
ALTER TABLE "learners" ADD COLUMN "plateforme" "PlateformeElearning";

-- L'email de connexion ne vise que les stagiaires qui ont une plateforme.
UPDATE "automations" SET
  "conditions" = '{"modalite": ["E_LEARNING", "HYBRIDE"], "avecPlateforme": true}'::jsonb,
  "description" = 'Envoie ses identifiants de première connexion à chaque stagiaire d''une session e-learning ou hybride dont la fiche indique une plateforme, le jour du démarrage à 8 h.',
  "updatedAt" = now()
WHERE "nom" = 'Accès à la plateforme en ligne';

UPDATE "email_templates" SET
  "description" = $t$Stagiaire d'une formation en ligne (e-learning ou mixte) dont la fiche indique une plateforme (E-forma ou Mon Parcours En Ligne), le jour du démarrage : identifiants de première connexion. À ne pas envoyer quand le formateur gère lui-même l'accès.$t$,
  "updatedAt" = now()
WHERE "code" = 'CONNEXION_PLATEFORME';
