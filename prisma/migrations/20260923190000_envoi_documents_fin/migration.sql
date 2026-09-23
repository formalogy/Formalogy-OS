-- L'attestation et le certificat étaient produits et classés, mais jamais
-- transmis à l'apprenant : il fallait les envoyer à la main. Maintenant que
-- les emails savent porter une pièce jointe, l'automatisation du lendemain
-- les joint à un message.
INSERT INTO "email_templates" ("id","code","nom","description","sujet","corps","actif","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'DOCUMENTS_FIN','Envoi de l''attestation et du certificat','Envoyé à l''apprenant le lendemain de la fin de session, avec ses documents en pièces jointes.','Vos documents de fin de formation — {{session.formation}}','Bonjour {{apprenant.prenom}},

Vous trouverez en pièces jointes les documents de votre formation « {{session.formation}} » ({{session.dates}}) :

— votre attestation de fin de formation,
— votre certificat de réalisation.

Conservez-les : ils peuvent vous être demandés par votre employeur ou votre financeur.

Nous restons à votre disposition pour toute question.

Bien cordialement,
L''équipe {{organisme.nom}}',true,now(),now())
ON CONFLICT ("code") DO NOTHING;

-- L'automatisation du lendemain génère les documents puis les envoie. L'ordre
-- des actions compte : les documents existent quand l'email part.
UPDATE "automations"
SET "actions" = '[{"type": "DOCUMENTS_FIN_FORMATION"}, {"type": "EMAIL", "modele": "DOCUMENTS_FIN", "destinataires": "APPRENANTS_SESSION", "joindre": ["ATTESTATION", "CERTIFICAT"]}]'::jsonb,
    "description" = 'Génère l''attestation et le certificat de réalisation des apprenants prêts, le lendemain de la fin de la session, et les leur envoie.',
    "updatedAt" = now()
WHERE "declencheur" = 'SESSION_APRES_FIN'
  AND "actions" = '[{"type": "DOCUMENTS_FIN_FORMATION"}]'::jsonb;
