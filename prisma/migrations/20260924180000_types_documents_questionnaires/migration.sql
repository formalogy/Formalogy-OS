-- Phase 4 du cahier des charges : six types de documents pour ranger dans la
-- bibliothèque les questionnaires qualité de l'organisme (modèles vierges ou
-- exemplaires remplis sur papier). Les réponses en ligne, elles, restent dans
-- la table « questionnaires » et s'affichent sur les fiches.

-- La numérotation d'affichage est espacée pour placer les questionnaires juste
-- après « Questionnaire de satisfaction » sans bouleverser l'ordre existant.
-- Le champ « ordre » ne sert qu'au tri des listes.
UPDATE "document_types" SET "ordre" = "ordre" * 10 WHERE "ordre" BETWEEN 1 AND 16;
UPDATE "document_types" SET "ordre" = 900 WHERE "code" = 'MODELE_CONVENTION_PARTICULIER';
UPDATE "document_types" SET "ordre" = 901 WHERE "code" = 'MODELE_CONVENTION_ENTREPRISE';

INSERT INTO "document_types" ("id","code","nom","categorie","ordre") VALUES
  (gen_random_uuid()::text,'QUESTIONNAIRE_POSITIONNEMENT','Questionnaire avant la formation — attentes et positionnement','APPRENANT',71),
  (gen_random_uuid()::text,'QUESTIONNAIRE_CHAUD_APPRENANT','Questionnaire à chaud — apprenant','APPRENANT',72),
  (gen_random_uuid()::text,'QUESTIONNAIRE_CHAUD_FORMATEUR','Questionnaire à chaud — formateur','FORMATEUR',73),
  (gen_random_uuid()::text,'QUESTIONNAIRE_FROID','Questionnaire à froid (J+60)','APPRENANT',74),
  (gen_random_uuid()::text,'QUESTIONNAIRE_FINANCEUR','Questionnaire financeur (campagne annuelle)','FINANCE',75),
  (gen_random_uuid()::text,'QUESTIONNAIRE_ANNUEL_FORMATEURS','Questionnaire annuel des formateurs (campagne annuelle)','FORMATEUR',76)
ON CONFLICT ("code") DO NOTHING;
