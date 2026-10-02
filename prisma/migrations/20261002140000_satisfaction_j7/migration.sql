-- Satisfaction 7 jours après la fin de formation (client, 02/10/2026) :
-- questionnaire à l'entreprise cliente (Qualiopi, indicateur 30) et relance
-- des stagiaires qui n'ont pas répondu à la satisfaction à chaud.
ALTER TYPE "TypeQuestionnaire" ADD VALUE 'CLIENT';
ALTER TABLE "questionnaires" ADD COLUMN "companyId" TEXT;
ALTER TABLE "questionnaires" ADD CONSTRAINT "questionnaires_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "questionnaires_companyId_idx" ON "questionnaires"("companyId");

INSERT INTO "email_templates" ("id","code","nom","description","sujet","corps","actif","proposeApprenant","createdAt","updatedAt") VALUES
(gen_random_uuid()::text, 'CLIENT', 'Satisfaction de l''entreprise cliente (J+7)',
$t$Envoyé à l'entreprise cliente 7 jours après la fin d'une session : son avis sur la formation suivie par ses salariés (lien personnel).$t$,
$t$Votre avis sur la formation {{session.formation}}$t$,
$t$Bonjour,

Vos collaborateurs ont suivi la formation « {{session.formation}} » ({{session.dates}}) avec {{organisme.nom}}, animée par {{session.formateur}}.

Votre avis nous est précieux pour continuer à améliorer nos formations. Pourriez-vous prendre deux minutes pour répondre à ce court questionnaire ?

{{questionnaire.lienClient}}

Merci par avance pour votre retour.

Bien cordialement,
L'équipe {{organisme.nom}}
{{organisme.telephone}}$t$, true, false, now(), now()),
(gen_random_uuid()::text, 'SATISFACTION_RELANCE', 'Relance du questionnaire de satisfaction (J+7)',
$t$Envoyé 7 jours après la fin d'une session aux stagiaires qui n'ont pas encore donné leur avis (lien personnel ; rien à ceux qui ont répondu).$t$,
$t$Votre avis sur la formation {{session.formation}} (rappel)$t$,
$t$Bonjour {{apprenant.prenom}},

Vous avez terminé la formation « {{session.formation}} » il y a quelques jours, et nous n'avons pas encore reçu votre avis.

Il ne vous faudra qu'une minute pour répondre à notre questionnaire de satisfaction ; votre retour nous aide à améliorer nos formations :

{{questionnaire.lien}}

Merci beaucoup,
L'équipe {{organisme.nom}}
{{organisme.telephone}}$t$, true, false, now(), now())
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "automations" ("id","nom","description","declencheur","parametres","conditions","actions","actif","activeeAt","createdAt","updatedAt") VALUES
(gen_random_uuid()::text,'Satisfaction de l''entreprise cliente','Sept jours après la fin d''une session, à 10 h : questionnaire de satisfaction à l''entreprise cliente (son adresse email, à défaut celle d''un de ses contacts). Rien pour une session sans entreprise.','SESSION_APRES_FIN','{"jours": 7, "heure": 10}'::jsonb,'{}'::jsonb,'[{"type": "EMAIL", "modele": "CLIENT", "destinataires": "ENTREPRISE_SESSION"}]'::jsonb,true,now(),now(),now()),
(gen_random_uuid()::text,'Relance du questionnaire de satisfaction','Sept jours après la fin d''une session, à 10 h : relance des stagiaires qui n''ont pas répondu au questionnaire de satisfaction.','SESSION_APRES_FIN','{"jours": 7, "heure": 10}'::jsonb,'{}'::jsonb,'[{"type": "EMAIL", "modele": "SATISFACTION_RELANCE", "destinataires": "APPRENANTS_SESSION"}]'::jsonb,true,now(),now(),now());
