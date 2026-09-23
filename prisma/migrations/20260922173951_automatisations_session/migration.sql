-- Deux nouveaux déclencheurs planifiés, symétriques à SESSION_AVANT_DEBUT
-- mais rattachés à la fin d'une session plutôt qu'à son début.
ALTER TYPE "DeclencheurAutomatisation" ADD VALUE 'SESSION_AVANT_FIN';
ALTER TYPE "DeclencheurAutomatisation" ADD VALUE 'SESSION_APRES_FIN';
