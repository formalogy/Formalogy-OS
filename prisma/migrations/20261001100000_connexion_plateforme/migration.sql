-- Accès à la plateforme en ligne (demande du client du 01/10/2026) : un
-- apprenant inscrit à une session e-learning ou hybride reçoit ses
-- identifiants de première connexion. Le mot de passe initial suit la règle
-- de l'organisme : initiales en majuscules suivies de 12345.
INSERT INTO "email_templates" ("id","code","nom","description","sujet","corps","actif","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'CONNEXION_PLATEFORME','Connexion à la plateforme en ligne','À envoyer à un apprenant inscrit à une formation en ligne (e-learning ou hybride) : identifiants de première connexion à la plateforme.','Vos accès à la plateforme de formation — {{session.formation}}','Bonjour {{apprenant.prenom}},

Vous êtes inscrit(e) à la formation « {{session.formation}} » ({{session.dates}}), qui se suit en ligne.

Voici vos accès à la plateforme de formation :
- Adresse : [ADRESSE DE LA PLATEFORME À COMPLÉTER]
- Identifiant : {{apprenant.email}}
- Mot de passe de première connexion : {{apprenant.motDePasse}}

Pensez à choisir un nouveau mot de passe dès votre première connexion.

Pour toute question, répondez simplement à cet email.

Bonne formation,
L''équipe {{organisme.nom}}',true,now(),now());

INSERT INTO "automations" ("id","nom","description","declencheur","parametres","conditions","actions","actif","activeeAt","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'Accès à la plateforme en ligne','Envoie ses identifiants de première connexion à un apprenant dès son inscription à une session e-learning ou hybride.','INSCRIPTION_SESSION','{}'::jsonb,'{"modalite": ["E_LEARNING", "HYBRIDE"]}'::jsonb,'[{"type": "EMAIL", "modele": "CONNEXION_PLATEFORME", "destinataires": "APPRENANT"}]'::jsonb,true,now(),now(),now());
