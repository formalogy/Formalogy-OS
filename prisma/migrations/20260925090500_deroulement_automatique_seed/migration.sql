-- Déroulement sans intervention (décision du client du 25/09/2026). Une
-- session lancée avance seule jusqu'à la facture ; le client n'intervient
-- qu'en cas de problème. Le client ayant demandé que toutes les
-- automatisations soient actives, celles créées ici le sont d'emblée.

-- 1. Dernier jour, en fin de journée : le mail de fin porte le lien du
--    questionnaire de satisfaction (jusqu'ici envoyé seulement au passage
--    manuel à « Terminée »).
UPDATE "email_templates" SET
  "corps" = $$Bonjour {{apprenant.prenom}},

Votre formation « {{session.formation}} » se termine aujourd'hui. Merci pour votre participation et votre implication.

Votre avis nous est précieux : pourriez-vous répondre à ce court questionnaire ? Il prend moins de deux minutes.
{{questionnaire.lien}}

Ce lien vous est personnel.

Votre attestation de fin de formation et votre certificat de réalisation vous seront envoyés dans les prochains jours.

Bien cordialement,
L'équipe {{organisme.nom}}$$,
  "updatedAt" = now()
WHERE "code" = 'FIN_FORMATION';

UPDATE "automations" SET
  "parametres" = '{"jours": 0, "heure": 16}'::jsonb,
  "description" = 'Le dernier jour de la session, à partir de 16 h : mail de fin de formation aux inscrits, avec le lien du questionnaire de satisfaction.',
  "updatedAt" = now()
WHERE "nom" = 'Fin de formation' AND "declencheur" = 'SESSION_AVANT_FIN';

-- 2. Les suites manuelles de fin de session disparaissent : le questionnaire
--    part le dernier jour (ci-dessus), la facture et les attestations sont
--    automatiques, les tâches « Préparer la facturation » et « Déposer les
--    attestations » n'ont plus d'objet.
DELETE FROM "automations" WHERE "nom" = 'Suites d''une session terminée' AND "declencheur" = 'SESSION_TERMINEE';

-- 3. Dernier jour, en fin de journée : bilan du formateur, qui porte
--    l'évaluation des acquis de chaque apprenant (transmise par le formateur
--    en fin de parcours, décision du client).
UPDATE "email_templates" SET
  "sujet" = 'Bilan de la session « {{session.formation}} » et évaluation des acquis',
  "corps" = $$Bonjour {{formateur.prenom}},

La session « {{session.formation}} » ({{session.dates}}) s'achève : merci pour votre intervention.

Pour la clôturer, merci de remplir ce court formulaire. Il comprend votre retour sur la session et l'évaluation des acquis de chaque apprenant, qui figure sur son attestation de fin de formation :

{{questionnaire.lienChaudFormateur}}

Les attestations partent dès réception de votre évaluation. Ce lien vous est personnel.

Bien cordialement,
L'équipe {{organisme.nom}}$$,
  "updatedAt" = now()
WHERE "code" = 'CHAUD_FORMATEUR';

INSERT INTO "automations" ("id","nom","description","declencheur","parametres","conditions","actions","actif","activeeAt","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'Bilan du formateur et évaluation des acquis','Le dernier jour de la session, à partir de 16 h : le formateur reçoit son questionnaire de fin de session, qui comprend l''évaluation des acquis de chaque apprenant.','SESSION_AVANT_FIN','{"jours": 0, "heure": 16}'::jsonb,'{}'::jsonb,'[{"type": "EMAIL", "modele": "CHAUD_FORMATEUR", "destinataires": "FORMATEUR_SESSION"}]'::jsonb,true,now(),now(),now());

-- 4. Chaque jour de session, le matin : la feuille d'émargement du jour au
--    formateur (une page le matin, une l'après-midi).
INSERT INTO "email_templates" ("id","code","nom","description","sujet","corps","actif","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'EMARGEMENT_JOUR','Feuille d''émargement du jour (formateur)','Envoyé au formateur chaque matin de session, avec la feuille d''émargement du jour en pièce jointe.','Feuille d''émargement du jour — {{session.formation}}',$$Bonjour {{formateur.prenom}},

Vous trouverez en pièce jointe la feuille d'émargement du jour pour la session « {{session.formation}} » ({{session.numero}}) : une page pour le matin, une pour l'après-midi.

Merci de la faire signer par chaque participant à chaque demi-journée, de la signer vous-même, puis de nous la retourner (une photo ou un scan en réponse à cet email suffit).

En cas d'absence, prévenez-nous le jour même.

Bien cordialement,
L'équipe {{organisme.nom}}$$,true,now(),now()) ON CONFLICT ("code") DO NOTHING;

INSERT INTO "automations" ("id","nom","description","declencheur","parametres","conditions","actions","actif","activeeAt","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'Feuille d''émargement du jour','Chaque jour de la session, à partir de 7 h : le formateur reçoit la feuille d''émargement du jour, prête à imprimer.','SESSION_JOUR','{"heure": 7}'::jsonb,'{}'::jsonb,'[{"type": "EMAIL", "modele": "EMARGEMENT_JOUR", "joindre": ["EMARGEMENT"], "destinataires": "FORMATEUR_SESSION"}]'::jsonb,true,now(),now(),now());

-- 5. Facture : émise le lendemain du dernier jour (la session passe seule à
--    « Terminée »), puis envoyée au payeur avec son PDF.
INSERT INTO "email_templates" ("id","code","nom","description","sujet","corps","actif","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'FACTURE','Envoi de la facture','Envoyé au payeur (entreprise, ou apprenant) avec le PDF de la facture émise dans Henrri.','Facture {{facture.numero}} — formation {{session.formation}}',$$Bonjour,

Vous trouverez en pièce jointe la facture n° {{facture.numero}} d'un montant de {{facture.montant}}, relative à la formation « {{session.formation}} » ({{session.dates}}).

Nous restons à votre disposition pour toute question.

Bien cordialement,
L'équipe {{organisme.nom}}$$,true,now(),now()) ON CONFLICT ("code") DO NOTHING;

UPDATE "automations" SET
  "actions" = '[{"type": "FACTURE_HENRRI"}, {"type": "EMAIL", "modele": "FACTURE", "joindre": ["FACTURE"], "destinataires": "PAYEUR"}]'::jsonb,
  "description" = 'Le lendemain du dernier jour, quand la session passe seule à « Terminée » : émet la facture dans Henrri, range son PDF dans les documents de la session et l''envoie au payeur.',
  "updatedAt" = now()
WHERE "nom" = 'Facturation automatique (Henrri)' AND "declencheur" = 'SESSION_TERMINEE';

UPDATE "automations" SET
  "description" = 'Le lendemain de la fin de la session : attestation et certificat de réalisation générés et envoyés à chaque apprenant dont le formateur a transmis l''évaluation des acquis (les autres les reçoivent dès sa réception).',
  "updatedAt" = now()
WHERE "nom" = 'Documents de fin de formation' AND "declencheur" = 'SESSION_APRES_FIN';

-- 6. Accueil du premier jour : à partir de 8 h (« une seule fois, avant le
--    début du premier jour », cahier des charges).
UPDATE "automations" SET
  "parametres" = '{"jours": 0, "heure": 8}'::jsonb,
  "description" = 'Le premier jour de la session, à partir de 8 h : mail d''accueil aux inscrits.',
  "updatedAt" = now()
WHERE "nom" = 'Accueil le jour de la formation' AND "declencheur" = 'SESSION_AVANT_DEBUT';

-- 7. Campagnes annuelles : activées, comme toutes les automatisations à la
--    demande du client. Leur activation date d'aujourd'hui : aucune campagne
--    passée n'est rattrapée.
UPDATE "automations" SET "actif" = true, "activeeAt" = now(), "updatedAt" = now()
WHERE "declencheur" = 'CAMPAGNE_ANNUELLE' AND "actif" = false;
