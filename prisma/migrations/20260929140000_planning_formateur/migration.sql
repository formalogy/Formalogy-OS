-- A-14 : l'email du lundi est le planning de la semaine du formateur, sans
-- aucune relance — planning et relances sont deux choses distinctes
-- (précision du client du 29/09/2026).
UPDATE "email_templates" SET
  "nom" = 'Planning de la semaine (formateur)',
  "description" = 'Envoyé chaque lundi au formateur qui a au moins une session dans la semaine : ses sessions, rien d''autre.',
  "sujet" = 'Votre planning de la semaine — {{organisme.nom}}',
  "corps" = $$Bonjour {{formateur.prenom}},

Voici votre planning de la semaine, {{synthese.periode}} :
{{synthese.sessions}}

Pour toute question, répondez simplement à cet email.

Bonne semaine,
L'équipe {{organisme.nom}}$$,
  "updatedAt" = now()
WHERE "code" = 'SYNTHESE_FORMATEUR';

UPDATE "automations" SET
  "nom" = 'Planning de la semaine aux formateurs',
  "description" = 'Chaque lundi, à partir de 7 h : chaque formateur qui a une session dans la semaine reçoit son planning (ses sessions des 7 prochains jours). Rien à qui n''a pas de session ; aucune relance dans cet email.',
  "updatedAt" = now()
WHERE "declencheur" = 'HEBDOMADAIRE' AND "actions" @> '[{"type": "SYNTHESE_FORMATEURS"}]'::jsonb;
