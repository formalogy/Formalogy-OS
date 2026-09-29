-- A-13, A-14, A-15 : emails et automatisations, actives d'emblée comme
-- toutes les automatisations à la demande du client. La date d'audit se
-- règle dans Paramètres → Organisme (« Prochain audit »).

INSERT INTO "email_templates" ("id","code","nom","description","sujet","corps","actif","createdAt","updatedAt") VALUES
  (gen_random_uuid()::text,'AUDIT_QUALIOPI_RAPPEL','Rappel avant l''audit Qualiopi (administrateurs)','Envoyé aux administrateurs quelques mois avant le prochain audit Qualiopi : où en est la préparation, et les indicateurs à reprendre.','Audit Qualiopi le {{qualiopi.dateAudit}} : c''est le moment de préparer les preuves',$$Bonjour,

Le prochain audit Qualiopi de {{organisme.nom}} a lieu le {{qualiopi.dateAudit}}. C'est le moment de rassembler et de vérifier les preuves de chaque indicateur.

Où en êtes-vous : {{qualiopi.bilan}}

À reprendre :
{{qualiopi.aVerifier}}

Le détail, indicateur par indicateur, se trouve dans l'onglet Qualiopi : {{qualiopi.lien}}

Message automatique de Formalogy OS$$,true,now(),now()),
  (gen_random_uuid()::text,'SYNTHESE_FORMATEUR','Synthèse de la semaine (formateur)','Envoyée chaque semaine à chaque formateur qui a une session ou quelque chose en attente : ses sessions des 7 prochains jours, bilans et émargements à compléter.','Votre semaine avec {{organisme.nom}}',$$Bonjour {{formateur.prenom}},

Voici votre semaine, {{synthese.periode}}.

Vos sessions :
{{synthese.sessions}}

À faire :
{{synthese.aFaire}}

Pour toute question, répondez simplement à cet email.

Bonne semaine,
L'équipe {{organisme.nom}}$$,true,now(),now()),
  (gen_random_uuid()::text,'DEVIS_RELANCE','Relance d''un devis sans réponse','Envoyé au client d''un devis Henrri resté sans réponse, tous les 15 jours, trois fois au plus ; le devis est joint quand Henrri le fournit.','Notre devis n° {{devis.numero}} — {{organisme.nom}}',$$Bonjour {{devis.contact}},

Nous revenons vers vous au sujet de notre devis n° {{devis.numero}} du {{devis.date}} ({{devis.montant}}).

Avez-vous pu en prendre connaissance ? Nous restons à votre disposition pour en parler, l'adapter à vos besoins ou convenir d'une date de formation.

Il vous suffit de répondre à cet email.

Bien cordialement,
L'équipe {{organisme.nom}}$$,true,now(),now())
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "automations" ("id","nom","description","declencheur","parametres","conditions","actions","actif","activeeAt","createdAt","updatedAt") VALUES
  (gen_random_uuid()::text,'Rappel avant l''audit Qualiopi','Six mois avant le prochain audit Qualiopi, à partir de 9 h : email aux administrateurs avec les indicateurs à reprendre, et tâche « Préparer l''audit ».','AVANT_AUDIT_QUALIOPI','{"moisAvant": 6, "heure": 9}'::jsonb,'{}'::jsonb,'[{"type": "EMAIL", "modele": "AUDIT_QUALIOPI_RAPPEL", "destinataires": "ADMINISTRATEURS"}, {"type": "TACHE", "titre": "Préparer l''audit Qualiopi du {{qualiopi.dateAudit}} : rassembler et vérifier les preuves", "delaiJours": 30, "priorite": "HAUTE"}]'::jsonb,true,now(),now(),now()),
  (gen_random_uuid()::text,'Synthèse de la semaine aux formateurs','Chaque lundi, à partir de 7 h : chaque formateur reçoit ses sessions des 7 prochains jours et ce qui l''attend (bilans, émargements). Rien à qui n''a rien de prévu.','HEBDOMADAIRE','{"jourSemaine": 1, "heure": 7}'::jsonb,'{}'::jsonb,'[{"type": "SYNTHESE_FORMATEURS"}]'::jsonb,true,now(),now(),now()),
  (gen_random_uuid()::text,'Relance des devis sans réponse','Chaque jour à partir de 10 h : reprise des devis de Henrri, puis relance du client tous les 15 jours, trois fois au plus ; ensuite, le devis est classé « sans suite ».','DEVIS_EN_ATTENTE','{"jours": 15, "relances": 3, "heure": 10}'::jsonb,'{}'::jsonb,'[{"type": "RELANCE_DEVIS"}]'::jsonb,true,now(),now(),now());
