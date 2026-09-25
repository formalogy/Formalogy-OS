-- Décision du client (25/09/2026) : la facture n'est pas envoyée au payeur.
-- Pour les sessions CPF, le payeur est la Caisse des Dépôts, qui se facture
-- sur sa propre plateforme ; la facture est simplement émise dans Henrri et
-- rangée dans le dossier de l'apprenant. Le modèle d'email FACTURE reste
-- disponible, désactivé, pour un envoi futur éventuel.
UPDATE "automations" SET
  "actions" = '[{"type": "FACTURE_HENRRI"}]'::jsonb,
  "description" = 'Le lendemain du dernier jour, quand la session passe seule à « Terminée » : émet la facture dans Henrri et range son PDF dans le dossier de l''apprenant et dans les documents de la session. Aucun envoi au payeur.',
  "updatedAt" = now()
WHERE "nom" = 'Facturation automatique (Henrri)' AND "declencheur" = 'SESSION_TERMINEE';

UPDATE "email_templates" SET "actif" = false, "updatedAt" = now() WHERE "code" = 'FACTURE';
