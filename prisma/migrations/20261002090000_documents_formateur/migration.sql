-- Pièces du dossier formateur rangées par l'assistant IA (client, 02/10/2026).
INSERT INTO "document_types" ("id","code","nom","categorie","ordre") VALUES
(gen_random_uuid()::text, 'NDA_FORMATEUR', 'Déclaration d''activité (NDA)', 'FORMATEUR', 12),
(gen_random_uuid()::text, 'PIECE_IDENTITE_FORMATEUR', 'Pièce d''identité', 'FORMATEUR', 13)
ON CONFLICT ("code") DO NOTHING;
