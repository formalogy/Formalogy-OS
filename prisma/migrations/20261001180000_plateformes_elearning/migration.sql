-- Deux plateformes de formation en ligne (client, 01/10/2026) : E-forma et
-- Mon Parcours En Ligne. Chaque formation indique la sienne ; leurs adresses
-- se saisissent dans Paramètres → Organisme.
CREATE TYPE "PlateformeElearning" AS ENUM ('EFORMA', 'MON_PARCOURS_EN_LIGNE');
ALTER TABLE "formations" ADD COLUMN "plateforme" "PlateformeElearning";
ALTER TABLE "organisme" ADD COLUMN "adresseEforma" TEXT, ADD COLUMN "adresseMonParcours" TEXT;

UPDATE "email_templates" SET
  "corps" = replace("corps", $t$Voici vos accès à notre plateforme de formation en ligne :
- Adresse : [À COMPLÉTER : adresse de la plateforme]$t$, $t$Voici vos accès à votre plateforme de formation en ligne, {{plateforme.nom}} :
- Adresse : {{plateforme.adresse}}$t$),
  "description" = $t$Stagiaire d'une formation en ligne (e-learning ou mixte), le jour du démarrage : identifiants de première connexion à la plateforme de la formation (E-forma ou Mon Parcours En Ligne).$t$,
  "updatedAt" = now()
WHERE "code" = 'CONNEXION_PLATEFORME';
