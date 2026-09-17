-- Le titre de la tâche de relance nomme désormais le financeur concerné.
UPDATE "automations"
SET "actions" = '[{"type": "TACHE", "titre": "Relancer {{dossier.financeur}} — dossier {{dossier.reference}} sans réponse", "delaiJours": 0, "priorite": "NORMALE"}]'::jsonb,
    "updatedAt" = now()
WHERE "declencheur" = 'DOSSIER_SANS_REPONSE'
  AND "actions"::text LIKE '%dossier sans réponse%';
