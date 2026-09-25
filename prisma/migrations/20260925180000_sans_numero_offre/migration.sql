-- Décision du client (25/09/2026) : sur la facture adressée à la Caisse des
-- Dépôts, l'identité de l'apprenant et son numéro de dossier CPF suffisent.
-- Le numéro d'offre, référence interne, n'est plus demandé (colonne ajoutée
-- le jour même, jamais renseignée hors données de test).
ALTER TABLE "learners" DROP COLUMN "numeroOffreCpf";
