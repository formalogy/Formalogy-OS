-- Signature de l'organisme, apposée sur les documents générés (convention,
-- attestation, certificat). Seul le chemin du fichier est stocké : l'image
-- vit dans l'espace de fichiers, comme les photos d'apprenants.
ALTER TABLE "organisme" ADD COLUMN "signatureCheminStockage" TEXT;
