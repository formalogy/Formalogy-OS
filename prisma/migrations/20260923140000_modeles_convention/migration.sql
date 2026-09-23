-- Deux types de documents réservés aux modèles de convention. Un modèle n'est
-- pas une convention : il ne concerne aucune session, il sert à en fabriquer.
-- Les distinguer évite de confondre le modèle vierge et les conventions
-- remplies dans la bibliothèque comme dans la liste de contrôle d'une session.
INSERT INTO "document_types" ("id","code","nom","categorie","ordre") VALUES
  (gen_random_uuid()::text,'MODELE_CONVENTION_PARTICULIER','Modèle de convention — particulier','SESSION',90),
  (gen_random_uuid()::text,'MODELE_CONVENTION_ENTREPRISE','Modèle de convention — entreprise','SESSION',91)
ON CONFLICT ("code") DO NOTHING;

-- Les deux modèles déjà déposés par le client sont reclassés automatiquement :
-- ce sont les seules conventions rattachées à rien du tout.
UPDATE "documents" SET "typeId" = (SELECT "id" FROM "document_types" WHERE "code" = 'MODELE_CONVENTION_PARTICULIER')
WHERE "nom" = 'Convention Formation Particulier'
  AND "sessionId" IS NULL AND "learnerId" IS NULL AND "companyId" IS NULL
  AND "typeId" = (SELECT "id" FROM "document_types" WHERE "code" = 'CONVENTION');

UPDATE "documents" SET "typeId" = (SELECT "id" FROM "document_types" WHERE "code" = 'MODELE_CONVENTION_ENTREPRISE')
WHERE "nom" = 'Convention Formation Entreprise'
  AND "sessionId" IS NULL AND "learnerId" IS NULL AND "companyId" IS NULL
  AND "typeId" = (SELECT "id" FROM "document_types" WHERE "code" = 'CONVENTION');
