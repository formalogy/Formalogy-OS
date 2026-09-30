-- Émargement : l'apprenant ne signe qu'en scannant sur place le QR code
-- présenté par le formateur, un QR code par demi-journée (décision du client
-- du 30/09/2026) : un absent ne peut pas signer à distance. Plus de lien de
-- signature dans les emails des apprenants ni de relance aux apprenants ; le
-- formateur reçoit la liste des signatures manquantes.

UPDATE "email_templates" SET
  "corps" = $$Bonjour {{apprenant.prenom}},

C'est aujourd'hui que débute votre formation « {{session.formation}} ».

Horaires : {{session.horaires}}
Lieu : {{session.lieu}}
Formateur : {{session.formateur}}

Émargement : au début de chaque demi-journée, votre formateur vous présentera votre QR code personnel. Scannez-le avec l'appareil photo de votre téléphone pour signer la feuille d'émargement en ligne.

Nous vous souhaitons une excellente formation.

Bien cordialement,
L'équipe {{organisme.nom}}$$,
  "updatedAt" = now()
WHERE "code" = 'ACCUEIL_SESSION';

UPDATE "email_templates" SET
  "corps" = $$Bonjour {{formateur.prenom}},

L'émargement de la session « {{session.formation}} » ({{session.numero}}) se fait en ligne, chacun sur son téléphone.

Les apprenants signent en scannant leur QR code personnel : le PDF joint en contient un par apprenant et par demi-journée (une page pour le matin, une pour l'après-midi). Présentez-leur la page de la demi-journée en cours, sur votre écran ou imprimée. Un QR code ne vaut que pour sa demi-journée : un apprenant absent ne peut pas signer à distance.

Vous signez vous aussi chaque demi-journée, avec votre lien personnel :
{{emargement.lien}}

En cas d'absence, signalez-la dans l'application (Mes sessions, puis Émargement).

En secours seulement (pas de réseau, par exemple), la feuille papier du jour est jointe : faites-la signer et renvoyez-la en répondant à cet email ; une photo ou un scan suffit.

Bien cordialement,
L'équipe {{organisme.nom}}$$,
  "updatedAt" = now()
WHERE "code" = 'EMARGEMENT_JOUR';

UPDATE "email_templates" SET
  "nom" = 'Signatures manquantes en fin de demi-journée (formateur)',
  "description" = 'Envoyé au formateur à la fin d''une demi-journée quand une signature manque : qui n''a pas signé (lui compris), avec son lien personnel.',
  "sujet" = 'Émargement : signatures manquantes — {{session.formation}}',
  "corps" = $$Bonjour {{formateur.prenom}},

Pour la séance du {{emargement.seance}} (session « {{session.formation}} », {{session.numero}}), il manque la signature de : {{emargement.manquants}}.

Si un apprenant est présent, faites-lui scanner son QR code (PDF de l'email du matin, ou bouton « QR code » de l'écran d'émargement). S'il est absent, signalez-le dans l'application.

Votre lien personnel, si vous n'avez pas encore signé :
{{emargement.lien}}

La signature reste possible jusqu'à ce soir minuit.

Bien cordialement,
L'équipe {{organisme.nom}}$$,
  "updatedAt" = now()
WHERE "code" = 'EMARGEMENT_SIGNATURE_FORMATEUR';

UPDATE "email_templates" SET
  "corps" = $$Bonjour {{formateur.prenom}},

L'émargement de la session « {{session.formation}} » ({{session.numero}}) n'est pas complet. Signatures manquantes :
{{emargement.manquants}}

Une séance se signe le jour même, jusqu'à minuit : les apprenants présents en scannant leur QR code, vous avec votre lien ({{emargement.lien}}).

Si un apprenant était absent, signalez-le dans l'application (Mes sessions, puis Émargement) : la feuille du jour se complète alors d'elle-même.

En dernier recours, la feuille papier est jointe : faites-la signer et renvoyez-la en répondant à cet email ; une photo ou un scan suffit.

Bien cordialement,
L'équipe {{organisme.nom}}$$,
  "updatedAt" = now()
WHERE "code" = 'EMARGEMENT_RELANCE';

-- Plus de relance par email aux apprenants.
UPDATE "email_templates" SET "actif" = false, "updatedAt" = now() WHERE "code" = 'EMARGEMENT_SIGNATURE_RELANCE';

UPDATE "automations" SET
  "description" = 'À la fin de chaque demi-journée de formation (heure de fin lue dans les horaires de la session) : si une signature manque, le formateur en reçoit la liste. Les apprenants signent sur place par QR code, sans relance par email.',
  "updatedAt" = now()
WHERE "declencheur" = 'FIN_DEMI_JOURNEE';
