-- Déroulement sans intervention (décision du client du 25/09/2026) : une
-- session lancée avance seule jusqu'à sa facture. Seule une alerte du client
-- l'arrête : c'est la date de suspension ci-dessous.
ALTER TABLE "sessions" ADD COLUMN "deroulementSuspenduAt" TIMESTAMP(3);

-- Déclencheur « chaque jour de la session » : il sert à envoyer au formateur
-- la feuille d'émargement du jour. Valeur ajoutée seule dans sa migration :
-- PostgreSQL interdit d'utiliser une valeur d'énumération dans la transaction
-- qui la crée (les automatisations qui l'emploient suivent dans la migration
-- suivante).
ALTER TYPE "DeclencheurAutomatisation" ADD VALUE 'SESSION_JOUR';
