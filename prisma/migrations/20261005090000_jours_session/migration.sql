-- Jours de formation choisis sur un calendrier (client, 05/10/2026) : une
-- formation peut se tenir un samedi, ou sauter des jours.
ALTER TABLE "sessions" ADD COLUMN "jours" TIMESTAMP(3)[] NOT NULL DEFAULT ARRAY[]::TIMESTAMP(3)[];

-- Sessions existantes hors ligne : leurs jours selon l'ancienne règle (tous
-- les jours de la période, sauf samedis et dimanches au milieu).
UPDATE "sessions" s SET "jours" = (
  SELECT COALESCE(array_agg(j ORDER BY j), ARRAY[]::TIMESTAMP(3)[])
  FROM generate_series(s."dateDebut", s."dateFin", interval '1 day') AS j
  WHERE j = s."dateDebut" OR j = s."dateFin" OR EXTRACT(ISODOW FROM j) < 6
)
WHERE s."modalite" NOT IN ('E_LEARNING', 'HYBRIDE') AND s."dateFin" - s."dateDebut" < interval '400 days';
