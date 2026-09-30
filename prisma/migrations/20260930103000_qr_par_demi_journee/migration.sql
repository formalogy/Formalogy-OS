-- Un seul jeu de QR codes par document (demande du client du 30/09/2026) :
-- ceux du matin avec l'email du matin, ceux de l'après-midi dans un email à
-- part, envoyé au formateur à la fin de la matinée.

UPDATE "email_templates" SET
  "corps" = $$Bonjour {{formateur.prenom}},

L'émargement de la session « {{session.formation}} » ({{session.numero}}) se fait en ligne, chacun sur son téléphone.

Le PDF joint contient le QR code de chaque apprenant pour la séance du matin : présentez-le, sur votre écran ou imprimé, et chaque apprenant scanne le sien pour signer. Les QR codes de l'après-midi vous parviendront à la fin de la matinée. Un QR code ne vaut que pour sa demi-journée : un apprenant absent ne peut pas signer à distance.

Vous signez vous aussi chaque demi-journée, avec votre lien personnel :
{{emargement.lien}}

En cas d'absence, signalez-la dans l'application (Mes sessions, puis Émargement).

En secours seulement (pas de réseau, par exemple), la feuille papier du jour est jointe : faites-la signer et renvoyez-la en répondant à cet email ; une photo ou un scan suffit.

Bien cordialement,
L'équipe {{organisme.nom}}$$,
  "updatedAt" = now()
WHERE "code" = 'EMARGEMENT_JOUR';

INSERT INTO "email_templates" ("id","code","nom","description","sujet","corps","actif","createdAt","updatedAt") VALUES
  (gen_random_uuid()::text,'EMARGEMENT_APRES_MIDI','QR codes de l''après-midi (formateur)','Envoyé au formateur à la fin de la matinée : les QR codes d''émargement de l''après-midi, un par apprenant.','QR codes de l''après-midi — {{session.formation}}',$$Bonjour {{formateur.prenom}},

Voici les QR codes d'émargement de l'après-midi pour la session « {{session.formation}} » ({{session.numero}}), en pièce jointe. Présentez-les au début de la séance : chaque apprenant scanne le sien pour signer.

Votre lien personnel, pour signer vous aussi :
{{emargement.lien}}

Bien cordialement,
L'équipe {{organisme.nom}}$$,true,now(),now())
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "automations" ("id","nom","description","declencheur","parametres","conditions","actions","actif","activeeAt","createdAt","updatedAt") VALUES
  (gen_random_uuid()::text,'QR codes de l''après-midi au formateur','À la fin de la matinée (heure de fin lue dans les horaires de la session) : le formateur reçoit les QR codes d''émargement de l''après-midi.','FIN_DEMI_JOURNEE','{"creneau": "MATIN"}'::jsonb,'{}'::jsonb,'[{"type": "EMAIL", "modele": "EMARGEMENT_APRES_MIDI", "joindre": ["QR_EMARGEMENT"], "destinataires": "FORMATEUR_SESSION"}]'::jsonb,true,now(),now(),now());
