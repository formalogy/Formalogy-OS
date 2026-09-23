-- Un financement saisi est désormais considéré acquis dès sa création : plus
-- de statut de demande (à monter / déposé / accordé / refusé), plus de
-- distinction montant demandé / accordé, plus d'automatisation de relance en
-- l'absence de réponse.

-- Aucune ligne "dossiers_financement" en production au moment de cette
-- migration : la fusion ci-dessous est correcte mais sans effet réel.
ALTER TABLE "dossiers_financement" ADD COLUMN "montant" DECIMAL(10,2);
UPDATE "dossiers_financement" SET "montant" = COALESCE("montantAccorde", "montantDemande");
ALTER TABLE "dossiers_financement" DROP COLUMN "montantDemande";
ALTER TABLE "dossiers_financement" DROP COLUMN "montantAccorde";
ALTER TABLE "dossiers_financement" DROP COLUMN "statut";
ALTER TABLE "dossiers_financement" DROP COLUMN "dateLimite";
ALTER TABLE "dossiers_financement" DROP COLUMN "dateReponse";
ALTER TABLE "dossiers_financement" DROP COLUMN "motifRefus";

DROP TYPE "StatutDossier";

-- L'automatisation "Relance des dossiers de financement" n'a plus de sens
-- sans statut de demande : elle n'a jamais été activée (0 exécution).
DELETE FROM "automations" WHERE "declencheur" = 'DOSSIER_SANS_REPONSE';

-- Retire la valeur DOSSIER_SANS_REPONSE de l'enum, devenue inutile.
CREATE TYPE "DeclencheurAutomatisation_new" AS ENUM ('APPRENANT_CREE', 'INSCRIPTION_SESSION', 'SESSION_AVANT_DEBUT', 'SESSION_TERMINEE', 'RELANCE_PROSPECT_DUE');
ALTER TABLE "automations" ALTER COLUMN "declencheur" TYPE "DeclencheurAutomatisation_new" USING ("declencheur"::text::"DeclencheurAutomatisation_new");
DROP TYPE "DeclencheurAutomatisation";
ALTER TYPE "DeclencheurAutomatisation_new" RENAME TO "DeclencheurAutomatisation";
