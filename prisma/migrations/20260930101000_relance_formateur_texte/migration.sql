-- Relance du formateur : la séance citée seule, pour éviter « la séance du
-- après-midi ».
UPDATE "email_templates" SET
  "corps" = $$Bonjour {{formateur.prenom}},

Session « {{session.formation}} » ({{session.numero}}), séance : {{emargement.seance}}. Il manque la signature de : {{emargement.manquants}}.

Si un apprenant est présent, faites-lui scanner son QR code (PDF de l'email du matin, ou bouton « QR code » de l'écran d'émargement). S'il est absent, signalez-le dans l'application.

Votre lien personnel, si vous n'avez pas encore signé :
{{emargement.lien}}

La signature reste possible jusqu'à ce soir minuit.

Bien cordialement,
L'équipe {{organisme.nom}}$$,
  "updatedAt" = now()
WHERE "code" = 'EMARGEMENT_SIGNATURE_FORMATEUR';
