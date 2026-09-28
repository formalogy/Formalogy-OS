-- Automatisation A-05 : relance du formateur quand la feuille d'émargement
-- signée d'un jour n'est pas arrivée. Actives d'emblée, comme toutes les
-- automatisations à la demande du client.

INSERT INTO "email_templates" ("id","code","nom","description","sujet","corps","actif","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'EMARGEMENT_RELANCE','Relance de la feuille d''émargement (formateur)','Envoyé au formateur quand une feuille d''émargement signée n''est pas arrivée, avec les feuilles concernées en pièce jointe.','Feuille d''émargement à nous retourner — {{session.formation}}',$$Bonjour {{formateur.prenom}},

Nous n'avons pas encore reçu la feuille d'émargement signée pour la session « {{session.formation}} » ({{session.numero}}) : {{emargement.jours}}.

Elle est de nouveau en pièce jointe. Merci de nous la renvoyer signée en répondant simplement à l'email du matin, ou à celui-ci : une photo ou un scan suffit, elle sera rangée automatiquement.

Bien cordialement,
L'équipe {{organisme.nom}}$$,true,now(),now()) ON CONFLICT ("code") DO NOTHING;

-- Chaque jour de session à 18 h, puis une dernière fois le lendemain de la
-- fin à 10 h.
INSERT INTO "automations" ("id","nom","description","declencheur","parametres","conditions","actions","actif","activeeAt","createdAt","updatedAt") VALUES
  (gen_random_uuid()::text,'Relance de la feuille d''émargement','Chaque jour de session, à partir de 18 h : si une feuille d''émargement signée n''est pas arrivée, le formateur est relancé, feuilles manquantes jointes.','SESSION_JOUR','{"heure": 18}'::jsonb,'{}'::jsonb,'[{"type": "RELANCE_EMARGEMENT"}]'::jsonb,true,now(),now(),now()),
  (gen_random_uuid()::text,'Dernière relance des feuilles d''émargement','Le lendemain de la fin de la session, à partir de 10 h : dernière relance du formateur pour les feuilles d''émargement signées encore manquantes.','SESSION_APRES_FIN','{"jours": 1, "heure": 10}'::jsonb,'{}'::jsonb,'[{"type": "RELANCE_EMARGEMENT"}]'::jsonb,true,now(),now(),now());

-- L'email du matin précise que la réponse avec la feuille signée suffit.
UPDATE "email_templates" SET
  "corps" = $$Bonjour {{formateur.prenom}},

Vous trouverez en pièce jointe la feuille d'émargement du jour pour la session « {{session.formation}} » ({{session.numero}}) : une page pour le matin, une pour l'après-midi.

Merci de la faire signer par chaque participant à chaque demi-journée, de la signer vous-même, puis de nous la renvoyer en répondant simplement à cet email : une photo ou un scan suffit, elle sera rangée automatiquement.

En cas d'absence, prévenez-nous le jour même.

Bien cordialement,
L'équipe {{organisme.nom}}$$,
  "updatedAt" = now()
WHERE "code" = 'EMARGEMENT_JOUR';
