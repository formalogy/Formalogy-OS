-- Le questionnaire envoyé avant la formation couvre désormais deux parties :
-- le positionnement (où en est l'apprenant) et ses attentes. Le modèle
-- d'email le dit.
--
-- Les conditions reprennent le texte d'origine mot pour mot : si le modèle a
-- été retouché depuis dans Paramètres → Modèles d'emails, la retouche est
-- conservée et cette migration ne fait rien.
UPDATE "email_templates"
SET "nom" = 'Questionnaire d''attentes et de positionnement',
    "updatedAt" = now()
WHERE "code" = 'POSITIONNEMENT' AND "nom" = 'Questionnaire de positionnement';

UPDATE "email_templates"
SET "description" = 'Envoyé à l''apprenant avant le début de la formation : ses attentes et son niveau de départ.',
    "updatedAt" = now()
WHERE "code" = 'POSITIONNEMENT' AND "description" = 'Envoyé à l''apprenant avant le début de la formation.';

UPDATE "email_templates"
SET "corps" = replace(
      "corps",
      'Afin d''adapter la formation à votre niveau et à vos attentes, merci de remplir ce court questionnaire de positionnement :',
      'Afin d''adapter la formation à votre niveau et à vos attentes, merci de remplir ce court questionnaire :'
    ),
    "updatedAt" = now()
WHERE "code" = 'POSITIONNEMENT'
  AND "corps" LIKE '%questionnaire de positionnement :%';
