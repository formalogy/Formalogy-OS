-- Campagnes annuelles : un déclencheur à date fixe, sans lien avec une
-- session. Jusqu'ici le moteur ne savait viser que des apprenants rattachés à
-- une session ; il sait désormais écrire à tous les formateurs actifs et à
-- tous les financeurs de l'année écoulée.
ALTER TYPE "DeclencheurAutomatisation" ADD VALUE 'CAMPAGNE_ANNUELLE';
