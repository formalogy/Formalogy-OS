-- L'envoi d'avant-formation (J-15) emporte désormais la convention de
-- l'apprenant, générée depuis le modèle déposé dans la bibliothèque. C'est ce
-- que demande le cahier des charges : « questionnaire pré-formation + convention ».
--
-- La condition sur le contenu exact de l'action évite d'écraser un réglage
-- que le client aurait modifié depuis.
UPDATE "automations"
SET "actions" = '[{"type": "EMAIL", "modele": "POSITIONNEMENT", "destinataires": "APPRENANTS_SESSION", "joindre": ["CONVENTION"]}]'::jsonb,
    "description" = 'Envoie le questionnaire d''attentes et de positionnement aux inscrits quinze jours avant le début de la session, avec leur convention de formation.',
    "updatedAt" = now()
WHERE "declencheur" = 'SESSION_AVANT_DEBUT'
  AND "actions" = '[{"type": "EMAIL", "modele": "POSITIONNEMENT", "destinataires": "APPRENANTS_SESSION"}]'::jsonb;
