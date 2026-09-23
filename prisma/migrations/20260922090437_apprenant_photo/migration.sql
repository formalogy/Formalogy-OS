-- Photo de profil de l'apprenant (avatar), stockée comme un document dans le
-- bucket existant : seul son emplacement est gardé en base.
ALTER TABLE "learners" ADD COLUMN "photoCheminStockage" TEXT;
