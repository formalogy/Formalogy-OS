-- A-14 : un formateur sans session dans la semaine ne reçoit pas de synthèse
-- (précision du client du 29/09/2026).
UPDATE "email_templates" SET
  "description" = 'Envoyée chaque lundi au formateur qui a au moins une session dans la semaine : ses sessions, puis les bilans et émargements à compléter.',
  "updatedAt" = now()
WHERE "code" = 'SYNTHESE_FORMATEUR';

UPDATE "automations" SET
  "description" = 'Chaque lundi, à partir de 7 h : chaque formateur qui a une session dans la semaine reçoit ses sessions des 7 prochains jours et ce qui l''attend (bilans, émargements). Rien à qui n''a pas de session.',
  "updatedAt" = now()
WHERE "declencheur" = 'HEBDOMADAIRE' AND "actions" @> '[{"type": "SYNTHESE_FORMATEURS"}]'::jsonb;
