-- Relances de signature : la séance est citée seule (« après-midi du mardi
-- 29 septembre 2026 »), pour éviter « la séance du après-midi ».

UPDATE "email_templates" SET
  "corps" = $$Bonjour {{apprenant.prenom}},

Vous n'avez pas encore signé l'émargement de votre formation « {{session.formation}} » pour cette séance : {{emargement.seance}}.

Merci de le faire dès maintenant, depuis votre téléphone ou un ordinateur :
{{emargement.lien}}

La signature reste possible jusqu'à ce soir minuit. Si vous étiez absent(e), prévenez votre formateur.

Bien cordialement,
L'équipe {{organisme.nom}}$$,
  "updatedAt" = now()
WHERE "code" = 'EMARGEMENT_SIGNATURE_RELANCE';

UPDATE "email_templates" SET
  "corps" = $$Bonjour {{formateur.prenom}},

Vous n'avez pas encore signé l'émargement de la session « {{session.formation}} » ({{session.numero}}) pour cette séance : {{emargement.seance}}.

Votre lien personnel :
{{emargement.lien}}

La signature reste possible jusqu'à ce soir minuit.

Bien cordialement,
L'équipe {{organisme.nom}}$$,
  "updatedAt" = now()
WHERE "code" = 'EMARGEMENT_SIGNATURE_FORMATEUR';
