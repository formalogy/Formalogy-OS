-- Cinq modèles d'emails, un par type de questionnaire qualité. Le code du
-- modèle est le nom du type : c'est ainsi que l'envoi retrouve son modèle.
INSERT INTO "email_templates" ("id","code","nom","description","sujet","corps","actif","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'POSITIONNEMENT','Questionnaire de positionnement','Envoyé à l''apprenant avant le début de la formation.','Avant votre formation « {{session.formation}} » — quelques questions','Bonjour {{apprenant.prenom}},

Vous êtes inscrit(e) à la formation « {{session.formation}} » ({{session.dates}}).

Afin d''adapter la formation à votre niveau et à vos attentes, merci de remplir ce court questionnaire de positionnement :

{{questionnaire.lienPositionnement}}

Il ne vous prendra que quelques minutes. Ce lien vous est personnel.

Bien cordialement,
L''équipe {{organisme.nom}}',true,now(),now());

INSERT INTO "email_templates" ("id","code","nom","description","sujet","corps","actif","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'CHAUD_FORMATEUR','Questionnaire formateur — fin de session','Envoyé au formateur à la fin d''une session qu''il a animée.','Votre retour sur la session « {{session.formation}} »','Bonjour {{formateur.prenom}},

La session « {{session.formation}} » ({{session.dates}}) vient de se terminer.

Votre retour nous est précieux pour améliorer nos formations. Merci de remplir ce court questionnaire :

{{questionnaire.lienChaudFormateur}}

Ce lien vous est personnel.

Bien cordialement,
L''équipe {{organisme.nom}}',true,now(),now());

INSERT INTO "email_templates" ("id","code","nom","description","sujet","corps","actif","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'FROID','Questionnaire à froid','Envoyé à l''apprenant plusieurs semaines après la fin de la formation.','Deux mois après votre formation « {{session.formation}} »','Bonjour {{apprenant.prenom}},

Vous avez suivi la formation « {{session.formation}} » ({{session.dates}}).

Maintenant que vous avez eu le temps de mettre en pratique ce que vous y avez appris, nous aimerions connaître ce que cette formation vous a réellement apporté :

{{questionnaire.lienFroid}}

Quelques minutes suffisent. Ce lien vous est personnel.

Bien cordialement,
L''équipe {{organisme.nom}}',true,now(),now());

INSERT INTO "email_templates" ("id","code","nom","description","sujet","corps","actif","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'FINANCEUR','Questionnaire financeur','Envoyé au financeur d''un dossier de prise en charge (campagne annuelle).','Votre retour sur notre collaboration — {{organisme.nom}}','Bonjour,

Dans le cadre de notre démarche qualité, nous recueillons chaque année l''avis des financeurs avec lesquels nous travaillons.

Merci de consacrer quelques minutes à ce questionnaire :

{{questionnaire.lienFinanceur}}

Ce lien vous est personnel.

Bien cordialement,
L''équipe {{organisme.nom}}',true,now(),now());

INSERT INTO "email_templates" ("id","code","nom","description","sujet","corps","actif","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'SATISFACTION_FORMATEUR','Satisfaction formateur (annuelle)','Envoyé aux formateurs une fois par an, hors session précise.','Votre satisfaction en tant que formateur — {{organisme.nom}}','Bonjour {{formateur.prenom}},

Dans le cadre de notre démarche qualité, nous recueillons chaque année l''avis des formateurs qui interviennent pour nous.

Merci de consacrer quelques minutes à ce questionnaire :

{{questionnaire.lienSatisfactionFormateur}}

Vos réponses nous aident à améliorer nos conditions de travail en commun. Ce lien vous est personnel.

Bien cordialement,
L''équipe {{organisme.nom}}',true,now(),now());

-- Deux automatisations, DÉSACTIVÉES comme toutes les autres : leur activation
-- reste une décision du client. Les trois autres types de questionnaires
-- (formateur à chaud, financeur, satisfaction formateur) s'envoient à la main.
INSERT INTO "automations" ("id","nom","description","declencheur","parametres","conditions","actions","actif","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'Questionnaire de positionnement','Envoie le questionnaire de positionnement aux inscrits quinze jours avant le début de la session.','SESSION_AVANT_DEBUT','{"jours": 15}'::jsonb,'{}'::jsonb,'[{"type": "EMAIL", "modele": "POSITIONNEMENT", "destinataires": "APPRENANTS_SESSION"}]'::jsonb,false,now(),now());

INSERT INTO "automations" ("id","nom","description","declencheur","parametres","conditions","actions","actif","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'Questionnaire à froid','Envoie le questionnaire à froid aux apprenants soixante jours après la fin de la session.','SESSION_APRES_FIN','{"jours": 60}'::jsonb,'{}'::jsonb,'[{"type": "EMAIL", "modele": "FROID", "destinataires": "APPRENANTS_SESSION"}]'::jsonb,false,now(),now());
