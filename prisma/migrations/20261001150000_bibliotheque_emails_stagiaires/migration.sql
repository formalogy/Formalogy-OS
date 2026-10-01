-- Bibliothèque des emails aux stagiaires (demande du client du 01/10/2026),
-- reformulée à partir de ses exemples : les variantes par formateur et par
-- durée deviennent des modèles génériques, remplis avec la session.
ALTER TABLE "email_templates" ADD COLUMN "proposeApprenant" BOOLEAN NOT NULL DEFAULT false;

-- Modèles existants adressés aux stagiaires.
UPDATE "email_templates" SET "proposeApprenant" = true
WHERE "code" IN ('BIENVENUE', 'CONVOCATION', 'RAPPEL_SESSION', 'ACCUEIL_SESSION', 'FIN_FORMATION', 'CONNEXION_PLATEFORME');

INSERT INTO "email_templates" ("id","code","nom","description","sujet","corps","actif","proposeApprenant","createdAt","updatedAt") VALUES
(gen_random_uuid()::text, 'NOUVEL_ENTRANT_PRESENTIEL', 'Bienvenue — formation en présentiel ou en visio',
$t$Nouveau stagiaire inscrit à une formation en présentiel ou en classe virtuelle (distanciel) : déroulement du parcours, étapes obligatoires et certification TOSA.$t$,
$t$Votre formation {{session.formation}} avec {{session.formateur}}$t$,
$t$Bonjour {{apprenant.prenom}},

Toute l'équipe {{organisme.nom}} vous remercie d'avoir choisi de vous former avec nous. Voici comment va se dérouler votre formation « {{session.formation}} » ({{formation.duree}}), animée par {{session.formateur}}.

Dates : {{session.dates}}
Horaires : {{session.horaires}}
Modalité : {{session.modalite}}
Lieu : {{session.lieu}}

Les étapes de votre parcours :
1. Avant la formation, vous recevrez deux courts questionnaires (votre niveau et vos attentes) ainsi que votre convention, à nous retourner signée.
2. {{session.formateur}} prendra contact avec vous avant le début de la formation pour vous en présenter l'organisation.
3. À la fin de la formation, vous recevrez un questionnaire de satisfaction, puis un message de Mon Compte Formation qui clôturera votre parcours.
4. Pour valider vos compétences, nous vous inscrirons à la certification TOSA, à passer en ligne.

Ces démarches peuvent sembler nombreuses : elles sont exigées par la certification Qualiopi, gage de qualité de nos formations. Nous les avons voulues simples : chaque questionnaire se remplit en ligne en moins d'une minute.

Nous restons à votre disposition : {{session.formateur}} pour le contenu de la formation, notre équipe pour la partie administrative.

À très bientôt,
L'équipe {{organisme.nom}}
{{organisme.telephone}}$t$, true, true, now(), now()),

(gen_random_uuid()::text, 'NOUVEL_ENTRANT_ELEARNING', 'Bienvenue — formation en e-learning',
$t$Nouveau stagiaire inscrit à une formation entièrement en ligne (e-learning) : déroulement, accès à la plateforme, étapes obligatoires et certification TOSA.$t$,
$t$Votre formation {{session.formation}} en e-learning$t$,
$t$Bonjour {{apprenant.prenom}},

Toute l'équipe {{organisme.nom}} vous remercie d'avoir choisi de vous former avec nous. Voici comment va se dérouler votre formation en ligne « {{session.formation}} » ({{formation.duree}}), accompagnée par {{session.formateur}}.

Période de formation : {{session.dates}}

Les étapes de votre parcours :
1. Vous recevrez d'abord deux courts questionnaires (votre niveau et vos attentes).
2. Le jour du démarrage, vous recevrez vos identifiants de connexion à notre plateforme. Vous suivez le parcours à votre rythme pendant la période ci-dessus ; votre accès reste ouvert 12 mois. Commencez par le test de positionnement.
3. À la fin de la formation, vous recevrez un questionnaire de satisfaction, puis un message de Mon Compte Formation qui clôturera votre parcours.
4. Pour valider vos compétences, nous vous inscrirons à la certification TOSA, à passer en ligne.

Ces démarches peuvent sembler nombreuses : elles sont exigées par la certification Qualiopi, gage de qualité de nos formations. Nous les avons voulues simples : chaque questionnaire se remplit en ligne en moins d'une minute.

Si vous financez votre formation avec votre CPF, pensez à valider votre inscription sur Mon Compte Formation (rubrique « Mes dossiers »), si ce n'est pas déjà fait.

Nous restons à votre entière disposition.

À très bientôt,
L'équipe {{organisme.nom}}
{{organisme.telephone}}$t$, true, true, now(), now()),

(gen_random_uuid()::text, 'NOUVEL_ENTRANT_MIXTE', 'Bienvenue — e-learning et séances en visio',
$t$Nouveau stagiaire inscrit à une formation mixte : parcours en ligne à son rythme et séances en groupe en visioconférence avec le formateur. Les dates des séances en visio sont à compléter avant l'envoi.$t$,
$t$Votre formation {{session.formation}} avec {{session.formateur}}$t$,
$t$Bonjour {{apprenant.prenom}},

Bienvenue chez {{organisme.nom}} ! Nous sommes ravis de vous accueillir pour votre formation « {{session.formation}} » ({{formation.duree}}), animée par {{session.formateur}}. Elle associe un parcours en ligne, à suivre à votre rythme, et des séances en groupe en visioconférence.

Parcours en ligne : {{session.dates}}
Séances en visio : [À COMPLÉTER : dates et horaires des séances]

Les étapes de votre parcours :
1. Vous recevrez d'abord deux courts questionnaires (votre niveau et vos attentes).
2. Le jour du démarrage, vous recevrez vos identifiants de connexion à notre plateforme en ligne ; votre accès reste ouvert 12 mois. Commencez par le test de positionnement.
3. Pour les séances en visio, {{session.formateur}} vous enverra directement les informations de connexion.
4. À la fin de la formation, vous recevrez un questionnaire de satisfaction, puis un message de Mon Compte Formation qui clôturera votre parcours.
5. Pour valider vos compétences, nous vous inscrirons à la certification TOSA, à passer en ligne.

Ces démarches peuvent sembler nombreuses : elles sont exigées par la certification Qualiopi, gage de qualité de nos formations. Nous les avons voulues simples : chaque questionnaire se remplit en ligne en moins d'une minute.

Si vous financez votre formation avec votre CPF, pensez à valider votre inscription sur Mon Compte Formation (rubrique « Mes dossiers »), si ce n'est pas déjà fait.

Bien cordialement,
L'équipe {{organisme.nom}}
{{organisme.telephone}}$t$, true, true, now(), now()),

(gen_random_uuid()::text, 'FIN_PARCOURS_TOSA', 'Fin de parcours : passage de la certification TOSA',
$t$Stagiaire qui vient de terminer sa formation : félicitations, rappel du questionnaire de satisfaction et passage de la certification TOSA sous 30 jours.$t$,
$t$Fin de votre parcours de formation et certification TOSA$t$,
$t$Bonjour {{apprenant.prenom}},

Félicitations : vous avez terminé votre formation « {{session.formation}} » !

Si ce n'est pas encore fait, merci de remplir le questionnaire de satisfaction que vous avez reçu par email : votre avis nous aide à progresser.

Place maintenant à la dernière étape : la certification TOSA, qui fait partie intégrante de votre parcours. Elle valide officiellement vos compétences et les valorise auprès des employeurs.

À réception de ce message, vous disposez de 30 jours pour la passer :
- en ligne, depuis chez vous, au moment qui vous convient (sans rendez-vous) ;
- sous forme de QCM : 35 questions, 1 heure ;
- avec une webcam et votre pièce d'identité.

Vos identifiants et le lien de connexion vous seront envoyés directement par TOSA, notre certificateur.

Nous sommes là pour vous aider à vous préparer : n'hésitez pas à nous appeler au {{organisme.telephone}}.

Bien cordialement,
L'équipe {{organisme.nom}}$t$, true, true, now(), now()),

(gen_random_uuid()::text, 'FELICITATIONS_TOSA', 'Félicitations pour la certification TOSA',
$t$Stagiaire qui a obtenu sa certification TOSA : félicitations et remise du diplôme.$t$,
$t$Félicitations pour votre certification TOSA$t$,
$t$Bonjour {{apprenant.prenom}},

Toute l'équipe {{organisme.nom}} vous adresse ses plus sincères félicitations pour l'obtention de votre certification TOSA !

Cette réussite est le fruit de votre engagement et du sérieux avec lequel vous avez suivi votre formation. Reconnue par les employeurs, cette certification valorise vos compétences et renforce votre employabilité.

Nous sommes fiers de vous avoir accompagné(e) dans cette étape et vous souhaitons beaucoup de succès pour la suite de votre parcours.

Bien cordialement,
L'équipe {{organisme.nom}}
{{organisme.telephone}}$t$, true, true, now(), now()),

(gen_random_uuid()::text, 'LIEN_INSCRIPTION', 'Lien pour finaliser l''inscription',
$t$Futur stagiaire à relancer pour qu'il finalise son inscription (Mon Compte Formation ou autre lien d'inscription). Le lien est à coller avant l'envoi.$t$,
$t$Votre inscription à la formation {{session.formation}}$t$,
$t$Bonjour {{apprenant.prenom}},

Je reviens vers vous au sujet de votre inscription à notre formation « {{session.formation}} ».

Pour la finaliser, il vous suffit de cliquer sur le lien ci-dessous :
[À COMPLÉTER : lien d'inscription]

Si la formation est financée par votre CPF, un reste à charge éventuel se règle dans un second temps, directement sur Mon Compte Formation.

Les places sont limitées : n'hésitez pas à me contacter pour toute question.

Bien cordialement,
L'équipe {{organisme.nom}}
{{organisme.telephone}}$t$, true, true, now(), now()),

(gen_random_uuid()::text, 'DEMANDE_PRISE_EN_CHARGE', 'Démarches de prise en charge auprès du financeur',
$t$Futur stagiaire qui doit demander lui-même la prise en charge de sa formation à son financeur (AFDAS, OPCO…) : lien du financeur à coller avant l'envoi.$t$,
$t$Votre formation {{session.formation}} : demande de prise en charge$t$,
$t$Bonjour {{apprenant.prenom}},

Toute l'équipe {{organisme.nom}} vous remercie de votre intérêt pour la formation « {{session.formation}} », animée par {{session.formateur}}.

Pour en obtenir le financement, la demande de prise en charge se fait directement auprès de votre financeur, sur son site :
[À COMPLÉTER : adresse du site du financeur]

Nous vous transmettons les documents utiles à votre demande (programme, devis) ainsi que le guide pour la remplir. Dates de la formation : {{session.dates}}.

Nous restons à votre entière disposition pour vous accompagner dans cette démarche.

Bien cordialement,
L'équipe {{organisme.nom}}
{{organisme.telephone}}$t$, true, true, now(), now());

-- Accès à la plateforme : reformulé d'après les exemples du client, et
-- envoyé le jour du démarrage à 8 h (« C'est le grand jour ») plutôt qu'à
-- l'inscription.
UPDATE "email_templates" SET
  "sujet" = $t$C'est parti : vos accès à la plateforme de formation$t$,
  "corps" = $t$Bonjour {{apprenant.prenom}},

C'est le grand jour : votre formation « {{session.formation}} » commence aujourd'hui !

Voici vos accès à notre plateforme de formation en ligne :
- Adresse : [À COMPLÉTER : adresse de la plateforme]
- Identifiant : {{apprenant.email}}
- Mot de passe : {{apprenant.motDePasse}} (vous le changerez à la première connexion)

Commencez votre parcours par le test de positionnement, et pensez à le terminer avant la fin de votre période de formation ({{session.dates}}).

Nous restons à votre disposition si besoin.

Bien cordialement,
L'équipe {{organisme.nom}}
{{organisme.telephone}}$t$,
  "description" = $t$Stagiaire d'une formation en ligne (e-learning ou mixte), le jour du démarrage : identifiants de première connexion à la plateforme. L'adresse de la plateforme est à compléter une fois pour toutes dans ce modèle.$t$,
  "updatedAt" = now()
WHERE "code" = 'CONNEXION_PLATEFORME';

UPDATE "automations" SET
  "description" = 'Envoie ses identifiants de première connexion à chaque stagiaire d''une session e-learning ou hybride, le jour du démarrage à 8 h.',
  "declencheur" = 'SESSION_AVANT_DEBUT',
  "parametres" = '{"jours": 0, "heure": 8}'::jsonb,
  "actions" = '[{"type": "EMAIL", "modele": "CONNEXION_PLATEFORME", "destinataires": "APPRENANTS_SESSION"}]'::jsonb,
  "updatedAt" = now()
WHERE "nom" = 'Accès à la plateforme en ligne';
