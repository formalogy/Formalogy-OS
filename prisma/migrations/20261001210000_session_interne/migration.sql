-- Session attribuée à Formalogy (formation en interne) ou au formateur
-- (client, 01/10/2026). La plateforme e-learning ne se choisit que pour une
-- session interne en ligne ; sinon le formateur gère l'accès.
ALTER TABLE "sessions" ADD COLUMN "interne" BOOLEAN NOT NULL DEFAULT false;
UPDATE "sessions" SET "plateforme" = NULL WHERE "plateforme" = 'FORMATEUR';

UPDATE "automations" SET
  "description" = 'Envoie ses identifiants de première connexion à chaque stagiaire d''une session e-learning ou hybride attribuée à Formalogy (plateforme E-forma ou Mon Parcours En Ligne), le jour du démarrage à 8 h.',
  "updatedAt" = now()
WHERE "nom" = 'Accès à la plateforme en ligne';
