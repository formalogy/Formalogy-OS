-- Deux nouveaux modèles d'email pour les automatisations de session.
INSERT INTO "email_templates" ("id","code","nom","description","sujet","corps","actif","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'ACCUEIL_SESSION','Accueil le jour de la formation','Envoyé le jour même du début d''une session.','Vous êtes attendu(e) aujourd''hui — {{session.formation}}','Bonjour {{apprenant.prenom}},

C''est aujourd''hui que débute votre formation « {{session.formation}} ».

Horaires : {{session.horaires}}
Lieu : {{session.lieu}}
Formateur : {{session.formateur}}

Nous vous souhaitons une excellente formation.

Bien cordialement,
L''équipe {{organisme.nom}}',true,now(),now());
INSERT INTO "email_templates" ("id","code","nom","description","sujet","corps","actif","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'FIN_FORMATION','Fin de formation','Envoyé le dernier jour d''une session.','Fin de votre formation — {{session.formation}}','Bonjour {{apprenant.prenom}},

Votre formation « {{session.formation}} » se termine aujourd''hui. Nous vous remercions pour votre participation et votre implication.

Votre attestation de fin de formation et, le cas échéant, votre certificat de réalisation vous seront transmis dès qu''ils seront disponibles.

Bien cordialement,
L''équipe {{organisme.nom}}',true,now(),now());

-- Quatre nouvelles automatisations de session, toutes DÉSACTIVÉES comme les
-- précédentes : rien ne se déclenche sans activation volontaire.
INSERT INTO "automations" ("id","nom","description","declencheur","parametres","conditions","actions","actif","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'Convocation avant la session','Envoie la convocation aux inscrits quelques jours avant le début.','SESSION_AVANT_DEBUT','{"jours": 7}'::jsonb,'{}'::jsonb,'[{"type": "EMAIL", "modele": "CONVOCATION", "destinataires": "APPRENANTS_SESSION"}]'::jsonb,false,now(),now());
INSERT INTO "automations" ("id","nom","description","declencheur","parametres","conditions","actions","actif","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'Accueil le jour de la formation','Envoie un mail d''accueil aux inscrits le jour même du début de la session.','SESSION_AVANT_DEBUT','{"jours": 0}'::jsonb,'{}'::jsonb,'[{"type": "EMAIL", "modele": "ACCUEIL_SESSION", "destinataires": "APPRENANTS_SESSION"}]'::jsonb,false,now(),now());
INSERT INTO "automations" ("id","nom","description","declencheur","parametres","conditions","actions","actif","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'Fin de formation','Envoie un mail de fin de formation aux inscrits le dernier jour de la session.','SESSION_AVANT_FIN','{"jours": 0}'::jsonb,'{}'::jsonb,'[{"type": "EMAIL", "modele": "FIN_FORMATION", "destinataires": "APPRENANTS_SESSION"}]'::jsonb,false,now(),now());
INSERT INTO "automations" ("id","nom","description","declencheur","parametres","conditions","actions","actif","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'Documents de fin de formation','Génère l''attestation et le certificat de réalisation des apprenants prêts, le lendemain de la fin de la session.','SESSION_APRES_FIN','{"jours": 1}'::jsonb,'{}'::jsonb,'[{"type": "DOCUMENTS_FIN_FORMATION"}]'::jsonb,false,now(),now());
