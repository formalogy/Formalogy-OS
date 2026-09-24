-- Les deux campagnes annuelles du cahier des charges, livrées désactivées
-- comme toutes les automatisations. Elles réutilisent les modèles d'emails
-- créés avec les questionnaires qualité.
--
-- « heure » est l'heure à partir de laquelle l'envoi est autorisé : avec un
-- réveil qui tourne toutes les heures, la campagne part à 10 h ; avec un
-- réveil quotidien, au premier passage suivant 10 h.
INSERT INTO "automations" ("id","nom","description","declencheur","parametres","conditions","actions","actif","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'Questionnaire annuel des formateurs','Envoie le questionnaire de satisfaction à tous les formateurs actifs, chaque 15 décembre à partir de 10 h.','CAMPAGNE_ANNUELLE','{"jour": 15, "mois": 12, "heure": 10}'::jsonb,'{}'::jsonb,'[{"type": "EMAIL", "modele": "SATISFACTION_FORMATEUR", "destinataires": "FORMATEURS_ACTIFS"}]'::jsonb,false,now(),now());

INSERT INTO "automations" ("id","nom","description","declencheur","parametres","conditions","actions","actif","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'Questionnaire annuel des financeurs','Envoie le questionnaire à tous les financeurs sollicités sur les douze derniers mois, chaque 25 janvier à partir de 10 h.','CAMPAGNE_ANNUELLE','{"jour": 25, "mois": 1, "heure": 10}'::jsonb,'{}'::jsonb,'[{"type": "EMAIL", "modele": "FINANCEUR", "destinataires": "FINANCEURS_ANNEE"}]'::jsonb,false,now(),now());
