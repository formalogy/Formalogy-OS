-- La facture Henrri part dès que la réalisation de la session est prouvée
-- (feuilles d'émargement signées, attestation et certificat de chaque
-- apprenant), et non plus au passage à « Terminée » (demande du client du
-- 30/09/2026). Même automatisation : ses exécutions passées restent
-- reconnues, rien n'est facturé deux fois.
UPDATE "automations" SET
  "declencheur" = 'REALISATION_COMPLETE',
  "description" = 'Dès que la réalisation d''une session est prouvée (feuille d''émargement signée pour chaque jour, attestation et certificat de chaque apprenant) : la facture est créée et finalisée dans Henrri, son numéro repris, son PDF rangé dans la session et dans la fiche du client. Elle n''est envoyée à personne.',
  "updatedAt" = now()
WHERE "actions" @> '[{"type": "FACTURE_HENRRI"}]'::jsonb;
