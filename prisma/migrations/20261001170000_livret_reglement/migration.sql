-- Livret d'accueil et règlement intérieur (01/10/2026) : documents de
-- référence de la Bibliothèque, joints aux emails de bienvenue des stagiaires.
INSERT INTO "document_types" ("id","code","nom","categorie","ordre") VALUES
(gen_random_uuid()::text, 'LIVRET_ACCUEIL', 'Livret d''accueil', 'FORMATION', 5),
(gen_random_uuid()::text, 'REGLEMENT_INTERIEUR', 'Règlement intérieur', 'FORMATION', 6)
ON CONFLICT ("code") DO NOTHING;
