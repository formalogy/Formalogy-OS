-- Émargement numérique : emails et automatisations. Chaque apprenant reçoit
-- son lien de signature avec l'email d'accueil ; le formateur reçoit le sien
-- chaque matin, avec les QR codes des apprenants et la feuille papier en
-- secours ; qui n'a pas signé est relancé en fin de demi-journée. Actives
-- d'emblée, comme toutes les automatisations à la demande du client.

-- Accueil de l'apprenant : son lien personnel de signature.
UPDATE "email_templates" SET
  "corps" = $$Bonjour {{apprenant.prenom}},

C'est aujourd'hui que débute votre formation « {{session.formation}} ».

Horaires : {{session.horaires}}
Lieu : {{session.lieu}}
Formateur : {{session.formateur}}

Émargement : à chaque demi-journée, signez la feuille d'émargement en ligne, depuis votre téléphone ou un ordinateur, avec votre lien personnel :
{{emargement.lien}}
Gardez cet email : ce lien sert pour toute la formation.

Nous vous souhaitons une excellente formation.

Bien cordialement,
L'équipe {{organisme.nom}}$$,
  "updatedAt" = now()
WHERE "code" = 'ACCUEIL_SESSION';

-- Email du matin au formateur : émargement en ligne, papier en secours.
UPDATE "email_templates" SET
  "nom" = 'Émargement du jour (formateur)',
  "description" = 'Envoyé au formateur chaque matin de session : son lien de signature, les QR codes des apprenants et, en secours, la feuille papier du jour.',
  "sujet" = 'Émargement du jour — {{session.formation}}',
  "corps" = $$Bonjour {{formateur.prenom}},

L'émargement de la session « {{session.formation}} » ({{session.numero}}) se fait en ligne : chaque participant signe chaque demi-journée, sur son téléphone ou un ordinateur.

Les apprenants ont reçu leur lien personnel par email. Pour ceux qui ne l'ont pas sous la main, le PDF « QR codes » joint contient le QR code de chacun : il suffit de le scanner.

Vous signez vous aussi chaque demi-journée, avec votre lien personnel :
{{emargement.lien}}

En cas d'absence, signalez-la dans l'application (Mes sessions, puis Émargement) : l'absent n'est pas relancé.

En secours seulement (pas de réseau, par exemple), la feuille papier du jour est jointe : faites-la signer et renvoyez-la en répondant à cet email ; une photo ou un scan suffit.

Bien cordialement,
L'équipe {{organisme.nom}}$$,
  "updatedAt" = now()
WHERE "code" = 'EMARGEMENT_JOUR';

-- Relance du formateur (18 h, puis le lendemain de la fin) : les signatures
-- qui manquent, nom par nom.
UPDATE "email_templates" SET
  "nom" = 'Émargement incomplet (formateur)',
  "description" = 'Envoyé au formateur quand l''émargement d''un jour est incomplet : signatures manquantes, et feuille papier jointe en dernier recours.',
  "sujet" = 'Émargement incomplet — {{session.formation}}',
  "corps" = $$Bonjour {{formateur.prenom}},

L'émargement de la session « {{session.formation}} » ({{session.numero}}) n'est pas complet. Signatures manquantes :
{{emargement.manquants}}

Une séance se signe en ligne le jour même, jusqu'à minuit, avec le lien personnel de chacun (le vôtre : {{emargement.lien}}).

Si un apprenant était absent, signalez-le dans l'application (Mes sessions, puis Émargement) : la feuille du jour se complète alors d'elle-même.

En dernier recours, la feuille papier est jointe : faites-la signer et renvoyez-la en répondant à cet email ; une photo ou un scan suffit.

Bien cordialement,
L'équipe {{organisme.nom}}$$,
  "updatedAt" = now()
WHERE "code" = 'EMARGEMENT_RELANCE';

INSERT INTO "email_templates" ("id","code","nom","description","sujet","corps","actif","createdAt","updatedAt") VALUES
  (gen_random_uuid()::text,'EMARGEMENT_SIGNATURE_RELANCE','Signature d''émargement manquante (apprenant)','Envoyé à la fin d''une demi-journée à l''apprenant qui ne l''a pas signée, avec son lien personnel.','Signature d''émargement manquante — {{session.formation}}',$$Bonjour {{apprenant.prenom}},

Vous n'avez pas encore signé l'émargement de la séance du {{emargement.seance}} (formation « {{session.formation}} »).

Merci de le faire dès maintenant, depuis votre téléphone ou un ordinateur :
{{emargement.lien}}

La signature reste possible jusqu'à ce soir minuit. Si vous étiez absent(e), prévenez votre formateur.

Bien cordialement,
L'équipe {{organisme.nom}}$$,true,now(),now()),
  (gen_random_uuid()::text,'EMARGEMENT_SIGNATURE_FORMATEUR','Signature d''émargement manquante (formateur)','Envoyé à la fin d''une demi-journée au formateur qui ne l''a pas signée, avec son lien personnel.','Votre signature d''émargement — {{session.formation}}',$$Bonjour {{formateur.prenom}},

Vous n'avez pas encore signé l'émargement de la séance du {{emargement.seance}} (session « {{session.formation}} », {{session.numero}}).

Votre lien personnel :
{{emargement.lien}}

La signature reste possible jusqu'à ce soir minuit.

Bien cordialement,
L'équipe {{organisme.nom}}$$,true,now(),now())
ON CONFLICT ("code") DO NOTHING;

-- Le matin, le formateur reçoit aussi les QR codes des apprenants.
UPDATE "automations" SET
  "nom" = 'Émargement du jour au formateur',
  "description" = 'Chaque matin de session, à partir de 7 h : le formateur reçoit son lien de signature, les QR codes des apprenants et la feuille papier du jour en secours.',
  "actions" = '[{"type": "EMAIL", "modele": "EMARGEMENT_JOUR", "joindre": ["EMARGEMENT", "QR_EMARGEMENT"], "destinataires": "FORMATEUR_SESSION"}]'::jsonb,
  "updatedAt" = now()
WHERE "declencheur" = 'SESSION_JOUR' AND "actions" @> '[{"modele": "EMARGEMENT_JOUR"}]'::jsonb;

UPDATE "automations" SET
  "nom" = 'Relance de l''émargement incomplet',
  "description" = 'Chaque jour de session, à partir de 18 h : si l''émargement d''un jour est incomplet, le formateur reçoit les signatures manquantes, avec la feuille papier en dernier recours.',
  "updatedAt" = now()
WHERE "declencheur" = 'SESSION_JOUR' AND "actions" @> '[{"type": "RELANCE_EMARGEMENT"}]'::jsonb;

UPDATE "automations" SET
  "nom" = 'Dernière relance de l''émargement incomplet',
  "description" = 'Le lendemain de la fin de la session, à partir de 10 h : dernière relance du formateur si l''émargement d''un jour est encore incomplet.',
  "updatedAt" = now()
WHERE "declencheur" = 'SESSION_APRES_FIN' AND "actions" @> '[{"type": "RELANCE_EMARGEMENT"}]'::jsonb;

INSERT INTO "automations" ("id","nom","description","declencheur","parametres","conditions","actions","actif","activeeAt","createdAt","updatedAt") VALUES
  (gen_random_uuid()::text,'Relance de signature en fin de demi-journée','À la fin de chaque demi-journée de formation (heure de fin lue dans les horaires de la session) : chaque participant qui n''a pas signé, apprenant ou formateur, est relancé avec son lien personnel. Les absents signalés ne le sont pas.','FIN_DEMI_JOURNEE','{}'::jsonb,'{}'::jsonb,'[{"type": "RELANCE_SIGNATURE"}]'::jsonb,true,now(),now(),now());
