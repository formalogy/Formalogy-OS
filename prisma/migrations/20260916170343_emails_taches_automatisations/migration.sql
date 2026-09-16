-- CreateEnum
CREATE TYPE "StatutEmail" AS ENUM ('SIMULE', 'ENVOYE', 'DELIVRE', 'OUVERT', 'ECHEC');

-- CreateEnum
CREATE TYPE "StatutTache" AS ENUM ('A_FAIRE', 'FAITE');

-- CreateEnum
CREATE TYPE "PrioriteTache" AS ENUM ('BASSE', 'NORMALE', 'HAUTE');

-- CreateEnum
CREATE TYPE "DeclencheurAutomatisation" AS ENUM ('APPRENANT_CREE', 'INSCRIPTION_SESSION', 'SESSION_AVANT_DEBUT', 'SESSION_TERMINEE', 'RELANCE_PROSPECT_DUE');

-- CreateEnum
CREATE TYPE "StatutExecution" AS ENUM ('REUSSIE', 'IGNOREE', 'ECHEC');

-- CreateTable
CREATE TABLE "email_templates" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "description" TEXT,
    "sujet" TEXT NOT NULL,
    "corps" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emails" (
    "id" TEXT NOT NULL,
    "destinataire" TEXT NOT NULL,
    "sujet" TEXT NOT NULL,
    "corps" TEXT NOT NULL,
    "statut" "StatutEmail" NOT NULL,
    "fournisseurId" TEXT,
    "erreur" TEXT,
    "envoyeAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivreAt" TIMESTAMP(3),
    "ouvertAt" TIMESTAMP(3),
    "templateId" TEXT,
    "learnerId" TEXT,
    "companyId" TEXT,
    "sessionId" TEXT,
    "prospectId" TEXT,
    "automationRunId" TEXT,
    "createdById" TEXT,

    CONSTRAINT "emails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "description" TEXT,
    "echeance" TIMESTAMP(3),
    "statut" "StatutTache" NOT NULL DEFAULT 'A_FAIRE',
    "priorite" "PrioriteTache" NOT NULL DEFAULT 'NORMALE',
    "faiteAt" TIMESTAMP(3),
    "learnerId" TEXT,
    "companyId" TEXT,
    "sessionId" TEXT,
    "prospectId" TEXT,
    "automationRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automations" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "description" TEXT,
    "declencheur" "DeclencheurAutomatisation" NOT NULL,
    "parametres" JSONB NOT NULL DEFAULT '{}',
    "conditions" JSONB NOT NULL DEFAULT '{}',
    "actions" JSONB NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_runs" (
    "id" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "cleUnicite" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "statut" "StatutExecution" NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_templates_code_key" ON "email_templates"("code");

-- CreateIndex
CREATE UNIQUE INDEX "emails_fournisseurId_key" ON "emails"("fournisseurId");

-- CreateIndex
CREATE INDEX "emails_envoyeAt_idx" ON "emails"("envoyeAt");

-- CreateIndex
CREATE INDEX "emails_learnerId_idx" ON "emails"("learnerId");

-- CreateIndex
CREATE INDEX "emails_sessionId_idx" ON "emails"("sessionId");

-- CreateIndex
CREATE INDEX "emails_statut_idx" ON "emails"("statut");

-- CreateIndex
CREATE INDEX "tasks_statut_echeance_idx" ON "tasks"("statut", "echeance");

-- CreateIndex
CREATE UNIQUE INDEX "automation_runs_cleUnicite_key" ON "automation_runs"("cleUnicite");

-- CreateIndex
CREATE INDEX "automation_runs_automationId_createdAt_idx" ON "automation_runs"("automationId", "createdAt");

-- AddForeignKey
ALTER TABLE "emails" ADD CONSTRAINT "emails_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "email_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emails" ADD CONSTRAINT "emails_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "learners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emails" ADD CONSTRAINT "emails_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emails" ADD CONSTRAINT "emails_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emails" ADD CONSTRAINT "emails_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "prospects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emails" ADD CONSTRAINT "emails_automationRunId_fkey" FOREIGN KEY ("automationRunId") REFERENCES "automation_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emails" ADD CONSTRAINT "emails_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "learners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "prospects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_automationRunId_fkey" FOREIGN KEY ("automationRunId") REFERENCES "automation_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "automations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Modèles d'emails initiaux (modifiables dans Paramètres > Modèles d'emails)
INSERT INTO "email_templates" ("id","code","nom","description","sujet","corps","actif","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'BIENVENUE','Bienvenue','Envoyé à la création d''un apprenant.','Bienvenue chez {{organisme.nom}}','Bonjour {{apprenant.prenom}},

Nous avons bien enregistré votre dossier et sommes ravis de vous compter parmi nos apprenants.

Vous recevrez prochainement votre convocation, avec les dates, les horaires et le lieu de votre formation.

Pour toute question, il vous suffit de répondre à cet email.

Bien cordialement,
L''équipe {{organisme.nom}}',true,now(),now());
INSERT INTO "email_templates" ("id","code","nom","description","sujet","corps","actif","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'CONVOCATION','Convocation','Envoyé lors de l''inscription à une session.','Convocation — {{session.formation}}','Bonjour {{apprenant.prenom}},

Vous êtes inscrit(e) à la formation « {{session.formation}} ».

Dates : {{session.dates}}
Horaires : {{session.horaires}}
Lieu : {{session.lieu}}
Modalité : {{session.modalite}}

Merci de vous présenter quelques minutes avant le début de la formation.

Bien cordialement,
L''équipe {{organisme.nom}}',true,now(),now());
INSERT INTO "email_templates" ("id","code","nom","description","sujet","corps","actif","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'RAPPEL_SESSION','Rappel avant la session','Envoyé quelques jours avant le début d''une session.','Rappel — votre formation « {{session.formation}} » approche','Bonjour {{apprenant.prenom}},

Petit rappel : votre formation « {{session.formation}} » commence bientôt.

Dates : {{session.dates}}
Horaires : {{session.horaires}}
Lieu : {{session.lieu}}

À très bientôt,
L''équipe {{organisme.nom}}',true,now(),now());
INSERT INTO "email_templates" ("id","code","nom","description","sujet","corps","actif","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'SATISFACTION','Demande d''avis après la formation','Envoyé à la fin d''une session.','Votre avis sur la formation « {{session.formation}} »','Bonjour {{apprenant.prenom}},

Vous venez de suivre la formation « {{session.formation}} ». Votre retour nous est précieux pour faire progresser nos formations.

Pourriez-vous nous dire en quelques lignes, en répondant simplement à cet email, ce que vous en avez pensé ?

Merci pour votre confiance,
L''équipe {{organisme.nom}}',true,now(),now());

-- Automatisations initiales, toutes DÉSACTIVÉES : rien ne se déclenche sans action volontaire
INSERT INTO "automations" ("id","nom","description","declencheur","parametres","conditions","actions","actif","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'Email de bienvenue','Accueille chaque nouvel apprenant disposant d''une adresse email.','APPRENANT_CREE','{}'::jsonb,'{}'::jsonb,'[{"type": "EMAIL", "modele": "BIENVENUE", "destinataires": "APPRENANT"}]'::jsonb,false,now(),now());
INSERT INTO "automations" ("id","nom","description","declencheur","parametres","conditions","actions","actif","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'Convocation à l''inscription','Envoie la convocation dès qu''un apprenant est inscrit à une session.','INSCRIPTION_SESSION','{}'::jsonb,'{}'::jsonb,'[{"type": "EMAIL", "modele": "CONVOCATION", "destinataires": "APPRENANT"}]'::jsonb,false,now(),now());
INSERT INTO "automations" ("id","nom","description","declencheur","parametres","conditions","actions","actif","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'Rappel avant la session','Rappelle la formation aux inscrits quelques jours avant son début.','SESSION_AVANT_DEBUT','{"jours": 2}'::jsonb,'{}'::jsonb,'[{"type": "EMAIL", "modele": "RAPPEL_SESSION", "destinataires": "APPRENANTS_SESSION"}]'::jsonb,false,now(),now());
INSERT INTO "automations" ("id","nom","description","declencheur","parametres","conditions","actions","actif","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'Suites d''une session terminée','Demande l''avis des apprenants et crée les tâches de clôture.','SESSION_TERMINEE','{}'::jsonb,'{}'::jsonb,'[{"type": "EMAIL", "modele": "SATISFACTION", "destinataires": "APPRENANTS_SESSION"}, {"type": "TACHE", "titre": "Préparer la facturation — session {{session.numero}}", "delaiJours": 3, "priorite": "HAUTE"}, {"type": "TACHE", "titre": "Déposer les attestations — session {{session.numero}}", "delaiJours": 7, "priorite": "NORMALE"}]'::jsonb,false,now(),now());
INSERT INTO "automations" ("id","nom","description","declencheur","parametres","conditions","actions","actif","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'Relance commerciale','Crée une tâche quand la date de relance d''un prospect est atteinte.','RELANCE_PROSPECT_DUE','{}'::jsonb,'{}'::jsonb,'[{"type": "TACHE", "titre": "Relancer {{prospect.nomComplet}}", "delaiJours": 0, "priorite": "HAUTE"}]'::jsonb,false,now(),now());
