-- E-forma et Mon Parcours En Ligne : un site internet, pas une adresse email.
UPDATE "email_templates" SET
  "corps" = replace("corps", '- Adresse : {{plateforme.adresse}}', '- Site internet : {{plateforme.adresse}}'),
  "updatedAt" = now()
WHERE "code" = 'CONNEXION_PLATEFORME';
