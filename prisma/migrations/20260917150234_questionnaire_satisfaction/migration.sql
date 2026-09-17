-- Le modèle « Demande d'avis » renvoie désormais vers le questionnaire en ligne
-- au lieu de demander une réponse par email. Mis à jour seulement s'il n'a pas
-- déjà été adapté.
UPDATE "email_templates"
SET "corps" = 'Bonjour {{apprenant.prenom}},

Vous venez de suivre la formation « {{session.formation}} ». Votre retour nous est précieux pour faire progresser nos formations.

Pourriez-vous répondre à ce court questionnaire ? Il prend moins de deux minutes :
{{questionnaire.lien}}

Ce lien vous est personnel.

Merci pour votre confiance,
L''équipe {{organisme.nom}}',
    "updatedAt" = now()
WHERE "code" = 'SATISFACTION' AND "corps" NOT LIKE '%questionnaire.lien%';
