-- Bilan de session du formateur (demande du client du 29/09/2026) : le
-- questionnaire de fin de session du formateur devient le « Bilan de
-- session », rempli en ligne et rangé en PDF dans la session.

UPDATE "document_types" SET
  "nom" = 'Bilan de session — formateur',
  "categorie" = 'SESSION'
WHERE "code" = 'QUESTIONNAIRE_CHAUD_FORMATEUR';

UPDATE "email_templates" SET
  "nom" = 'Bilan de session (formateur)',
  "description" = 'Envoyé au formateur le dernier jour de la session : lien vers son bilan de session en ligne, avec l''évaluation des acquis de chaque apprenant. Une fois validé, le bilan est rangé en PDF dans la session.',
  "sujet" = 'Votre bilan de session « {{session.formation}} » et l''évaluation des acquis',
  "corps" = $$Bonjour {{formateur.prenom}},

La session « {{session.formation}} » ({{session.dates}}) s'achève : merci pour votre intervention.

Pour la clôturer, merci de remplir votre bilan de session en ligne. Il comprend votre retour sur le déroulement et l'évaluation des acquis de chaque apprenant, qui figure sur son attestation de fin de formation :

{{questionnaire.lienChaudFormateur}}

Une fois validé, votre bilan est conservé dans le dossier de la session. Les attestations partent dès réception de votre évaluation. Ce lien vous est personnel.

Bien cordialement,
L'équipe {{organisme.nom}}$$,
  "updatedAt" = now()
WHERE "code" = 'CHAUD_FORMATEUR';

UPDATE "automations" SET
  "nom" = 'Bilan de session du formateur',
  "description" = 'Le dernier jour de la session, à partir de 16 h : le formateur reçoit le lien de son bilan de session en ligne (déroulement et évaluation des acquis). Dès qu''il le valide, le bilan est rangé en PDF dans la session.',
  "updatedAt" = now()
WHERE "actions" @> '[{"modele": "CHAUD_FORMATEUR"}]'::jsonb;
