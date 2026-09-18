-- CreateEnum
CREATE TYPE "StatutIndicateur" AS ENUM ('A_FAIRE', 'EN_COURS', 'CONFORME');

-- CreateEnum
CREATE TYPE "OrigineActionQualite" AS ENUM ('AUDIT', 'INTERNE', 'RECLAMATION');

-- CreateEnum
CREATE TYPE "StatutActionQualite" AS ENUM ('A_FAIRE', 'EN_COURS', 'FAITE');

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "indicateurQualiopi" INTEGER;

-- AlterTable
ALTER TABLE "organisme" ADD COLUMN     "qualiopiCertificateur" TEXT,
ADD COLUMN     "qualiopiExpireAt" TIMESTAMP(3),
ADD COLUMN     "qualiopiObtentionAt" TIMESTAMP(3),
ADD COLUMN     "qualiopiProchainAuditAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "indicateurs_qualiopi" (
    "numero" INTEGER NOT NULL,
    "critere" INTEGER NOT NULL,
    "intitule" TEXT NOT NULL,
    "specifique" BOOLEAN NOT NULL DEFAULT false,
    "applicable" BOOLEAN NOT NULL DEFAULT true,
    "statut" "StatutIndicateur" NOT NULL DEFAULT 'A_FAIRE',
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "indicateurs_qualiopi_pkey" PRIMARY KEY ("numero")
);

-- CreateTable
CREATE TABLE "actions_qualite" (
    "id" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "description" TEXT,
    "origine" "OrigineActionQualite" NOT NULL DEFAULT 'INTERNE',
    "statut" "StatutActionQualite" NOT NULL DEFAULT 'A_FAIRE',
    "numeroIndicateur" INTEGER,
    "responsable" TEXT,
    "echeance" TIMESTAMP(3),
    "faiteAt" TIMESTAMP(3),
    "bilan" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "actions_qualite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "actions_qualite_statut_idx" ON "actions_qualite"("statut");

-- CreateIndex
CREATE INDEX "actions_qualite_numeroIndicateur_idx" ON "actions_qualite"("numeroIndicateur");

-- CreateIndex
CREATE INDEX "documents_indicateurQualiopi_idx" ON "documents"("indicateurQualiopi");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_indicateurQualiopi_fkey" FOREIGN KEY ("indicateurQualiopi") REFERENCES "indicateurs_qualiopi"("numero") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "indicateurs_qualiopi" ADD CONSTRAINT "indicateurs_qualiopi_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actions_qualite" ADD CONSTRAINT "actions_qualite_numeroIndicateur_fkey" FOREIGN KEY ("numeroIndicateur") REFERENCES "indicateurs_qualiopi"("numero") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actions_qualite" ADD CONSTRAINT "actions_qualite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Indicateurs du Référentiel national qualité, version V10 : décret n° 2026-728
-- du 1er août 2026, applicable aux audits à compter du 1er novembre 2026.
-- Les indicateurs spécifiques sont créés « non applicables » : l'organisme
-- active ceux qui le concernent (certification, apprentissage, alternance…).
INSERT INTO "indicateurs_qualiopi" ("numero", "critere", "intitule", "specifique", "applicable", "statut", "updatedAt") VALUES
  (1, 1, 'Le prestataire diffuse une information accessible au public, détaillée et vérifiable sur les prestations proposées : prérequis, objectifs, type de reconnaissance de la formation délivrée, durée, modalités pédagogiques et de financements, délais d''accès, tarifs, contacts, méthodes mobilisées et modalités d''évaluation, accessibilité aux personnes en situation de handicap. Sa communication ne comporte aucune mention de nature à induire le public en erreur, notamment sur les conditions d''accès, le contenu, les modalités pédagogiques, le financement des formations, les droits ou l''absence de droits de poursuite d''études conférés par la formation préparée.', false, true, 'A_FAIRE', CURRENT_TIMESTAMP),
  (2, 1, 'Le prestataire diffuse des indicateurs de résultats adaptés à la nature des prestations mises en œuvre et des publics accueillis en précisant de manière transparente leurs modalités de calcul ou en s''appuyant sur des dispositifs existants.', false, true, 'A_FAIRE', CURRENT_TIMESTAMP),
  (3, 1, 'Lorsque le prestataire met en œuvre des prestations conduisant à une certification professionnelle, il informe sur les taux d''obtention des certifications préparées, les possibilités de valider un/ou des blocs de compétences, ainsi que sur les équivalences, passerelles, suites de parcours, en particulier les poursuites d''études, et les débouchés.', true, false, 'A_FAIRE', CURRENT_TIMESTAMP),
  (4, 2, 'Le prestataire analyse le besoin du bénéficiaire en lien avec l''entreprise et/ou le financeur concerné(s).', false, true, 'A_FAIRE', CURRENT_TIMESTAMP),
  (5, 2, 'Le prestataire définit les objectifs opérationnels et évaluables de la prestation.', false, true, 'A_FAIRE', CURRENT_TIMESTAMP),
  (6, 2, 'Le prestataire établit les contenus et les modalités de mise en œuvre de la prestation, adaptés aux objectifs définis et aux publics bénéficiaires.', false, true, 'A_FAIRE', CURRENT_TIMESTAMP),
  (7, 2, 'Lorsque le prestataire met en œuvre des prestations conduisant à une certification professionnelle, il s''assure de l''adéquation du ou des contenus de la prestation aux exigences de la certification visée et peut prouver sa capacité à assurer cette certification, y compris en qualité d''organisme habilité.', true, false, 'A_FAIRE', CURRENT_TIMESTAMP),
  (8, 2, 'Le prestataire détermine les procédures de positionnement et d''évaluation des acquis à l''entrée de la prestation.', true, false, 'A_FAIRE', CURRENT_TIMESTAMP),
  (9, 3, 'Le prestataire informe les publics bénéficiaires sur les conditions de déroulement de la prestation.', false, true, 'A_FAIRE', CURRENT_TIMESTAMP),
  (10, 3, 'Le prestataire met en œuvre et adapte la prestation, l''accompagnement et le suivi aux publics bénéficiaires.', false, true, 'A_FAIRE', CURRENT_TIMESTAMP),
  (11, 3, 'Le prestataire évalue l''atteinte par les publics bénéficiaires des objectifs de la prestation.', false, true, 'A_FAIRE', CURRENT_TIMESTAMP),
  (12, 3, 'Le prestataire décrit et met en œuvre les mesures pour favoriser l''engagement des bénéficiaires et prévenir les ruptures de parcours. Il s''assure de la prévention et du traitement de toute situation de violence, dont les violences sexistes et sexuelles, de harcèlement ou de discrimination dans le cadre de leur formation.', false, true, 'A_FAIRE', CURRENT_TIMESTAMP),
  (13, 3, 'Pour les formations en alternance, le prestataire, en lien avec l''entreprise, anticipe avec l''apprenant les missions confiées, à court, moyen et long terme, et assure la coordination et la progressivité des apprentissages réalisés en centre de formation et en entreprise.', true, false, 'A_FAIRE', CURRENT_TIMESTAMP),
  (14, 3, 'Le prestataire met en œuvre un accompagnement socio-professionnel, éducatif et relatif à l''exercice de la citoyenneté. Il dispose d''une procédure de traitement sans délai des situations de rupture liées à des difficultés, violences ou discriminations subies par l''apprenant en formation ou dans l''entreprise d''accueil.', true, false, 'A_FAIRE', CURRENT_TIMESTAMP),
  (15, 3, 'Le prestataire informe les apprentis de leurs droits et devoirs en tant qu''apprentis et salariés ainsi que des règles applicables en matière de santé et de sécurité en milieu professionnel, de manière renforcée lorsqu''ils sont mineurs. Il les informe des dispositifs d''accompagnement, de prévention et de signalement des situations de violences, de harcèlement moral ou sexuel, d''agissements sexistes et de discriminations, ainsi que des interlocuteurs susceptibles de les accompagner. Il communique les coordonnées du médiateur de l''apprentissage et veille à signaler les dysfonctionnements à l''inspection du travail.', true, false, 'A_FAIRE', CURRENT_TIMESTAMP),
  (16, 3, 'Lorsque le prestataire met en œuvre des formations conduisant à une certification professionnelle, il s''assure que les conditions de présentation des bénéficiaires à la certification respectent les exigences formelles de l''autorité de certification.', true, false, 'A_FAIRE', CURRENT_TIMESTAMP),
  (17, 4, 'Le prestataire met à disposition ou s''assure de la mise à disposition des moyens humains et techniques adaptés et d''un environnement approprié (conditions, locaux, équipements, plateaux techniques…).', false, true, 'A_FAIRE', CURRENT_TIMESTAMP),
  (18, 4, 'Le prestataire mobilise et coordonne les différents intervenants internes et/ou externes (pédagogiques, administratifs, logistiques, commerciaux…).', false, true, 'A_FAIRE', CURRENT_TIMESTAMP),
  (19, 4, 'Le prestataire met à disposition du bénéficiaire des ressources pédagogiques et permet à celui-ci de se les approprier. Lorsque des modules pédagogiques sont réalisés à distance, le prestataire vérifie l''effectivité de leur suivi par les apprenants. Au-delà d''un nombre d''intervenants par formation, fixé par arrêté du ministre chargé de la formation professionnelle, le prestataire dispose d''un référent pédagogique par formation chargé d''assurer la coordination pédagogique entre les intervenants.', false, true, 'A_FAIRE', CURRENT_TIMESTAMP),
  (20, 4, 'Le prestataire dispose d''un personnel dédié à l''appui à la mobilité nationale et internationale, d''un référent handicap et d''un conseil de perfectionnement. Il s''assure de la qualité du pilotage de la formation, de la participation des apprentis, formateurs et entreprises à sa gouvernance. Lorsque la proportion d''heures d''enseignement réalisées par des intervenants permanents est inférieure à un seuil fixé par arrêté du ministre chargé de la formation professionnelle, le prestataire s''assure de la mise en œuvre de modalités renforcées de supervision pédagogique et de contrôle de la qualité des interventions.', true, false, 'A_FAIRE', CURRENT_TIMESTAMP),
  (21, 5, 'Le prestataire détermine, mobilise et évalue les compétences des différents intervenants internes et/ou externes, adaptées aux prestations.', false, true, 'A_FAIRE', CURRENT_TIMESTAMP),
  (22, 5, 'Le prestataire entretient et développe les compétences de ses salariés, adaptées aux prestations qu''il délivre.', false, true, 'A_FAIRE', CURRENT_TIMESTAMP),
  (23, 6, 'Le prestataire réalise une veille légale et réglementaire sur le champ de la formation professionnelle et en exploite les enseignements.', false, true, 'A_FAIRE', CURRENT_TIMESTAMP),
  (24, 6, 'Le prestataire réalise une veille sur les évolutions des compétences, des métiers et des emplois dans ses secteurs d''intervention et en exploite les enseignements.', false, true, 'A_FAIRE', CURRENT_TIMESTAMP),
  (25, 6, 'Le prestataire réalise une veille sur les innovations pédagogiques et technologiques permettant une évolution de ses prestations et en exploite les enseignements.', false, true, 'A_FAIRE', CURRENT_TIMESTAMP),
  (26, 6, 'Le prestataire mobilise les expertises, outils et réseaux nécessaires pour accueillir, accompagner/former ou orienter les publics en situation de handicap.', false, true, 'A_FAIRE', CURRENT_TIMESTAMP),
  (27, 6, 'Lorsque le prestataire fait appel à la sous-traitance ou au portage salarial, il s''assure du respect de la conformité au présent référentiel et en assure la traçabilité dans les contrats de sous-traitance.', false, true, 'A_FAIRE', CURRENT_TIMESTAMP),
  (28, 6, 'Lorsque les prestations dispensées au bénéficiaire comprennent des périodes de formation en situation de travail, le prestataire mobilise son réseau de partenaires socio-économiques pour co-construire l''ingénierie de formation et favoriser l''accueil en entreprise.', true, false, 'A_FAIRE', CURRENT_TIMESTAMP),
  (29, 6, 'Le prestataire développe des actions qui concourent à l''insertion professionnelle ou la poursuite d''étude par la voie de l''apprentissage ou par toute autre voie permettant de développer leurs connaissances et leurs compétences.', true, false, 'A_FAIRE', CURRENT_TIMESTAMP),
  (30, 7, 'Le prestataire recueille les appréciations des parties prenantes : bénéficiaires, financeurs (le cas échéant), équipes pédagogiques et entreprises concernées.', false, true, 'A_FAIRE', CURRENT_TIMESTAMP),
  (31, 7, 'Le prestataire met en œuvre des modalités de traitement des difficultés rencontrées par les parties prenantes, des réclamations exprimées par ces dernières ainsi que des aléas survenus en cours de prestation.', false, true, 'A_FAIRE', CURRENT_TIMESTAMP),
  (32, 7, 'Le prestataire met en place une démarche d''amélioration continue à partir de l''analyse des appréciations et des réclamations, ainsi qu''une analyse des risques sur la qualité des formations délivrées.', false, true, 'A_FAIRE', CURRENT_TIMESTAMP),
  (33, 7, 'Le prestataire met en place un dispositif d''évaluation des contenus et des enseignements par les apprenants, distinct du recueil général de satisfaction, dont les résultats sont partagés avec les équipes pédagogiques et donnent lieu à la formalisation d''une démarche d''amélioration continue, dont il mesure périodiquement l''efficacité.', true, false, 'A_FAIRE', CURRENT_TIMESTAMP)
ON CONFLICT ("numero") DO NOTHING;
