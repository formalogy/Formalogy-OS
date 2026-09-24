-- La convocation devient un vrai document, joint à l'email de J-7, au lieu
-- d'un simple texte dans le corps du message.
UPDATE "automations"
SET "actions" = '[{"type": "EMAIL", "modele": "CONVOCATION", "destinataires": "APPRENANTS_SESSION", "joindre": ["CONVOCATION"]}]'::jsonb,
    "updatedAt" = now()
WHERE "declencheur" = 'SESSION_AVANT_DEBUT'
  AND "actions" = '[{"type": "EMAIL", "modele": "CONVOCATION", "destinataires": "APPRENANTS_SESSION"}]'::jsonb;

-- Le corps de l'email se contente d'annoncer la pièce jointe : le détail des
-- séances est désormais dans le document.
UPDATE "email_templates"
SET "corps" = 'Bonjour {{apprenant.prenom}},

Vous trouverez en pièce jointe votre convocation à la formation « {{session.formation}} » ({{session.dates}}).

Elle précise le détail des séances, le lieu, votre formateur et les personnes à contacter en cas de besoin. Conservez-la.

Bien cordialement,
L''équipe {{organisme.nom}}',
    "updatedAt" = now()
WHERE "code" = 'CONVOCATION'
  AND "corps" NOT LIKE '%pièce jointe%';
