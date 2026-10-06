-- Verrou du profil formateur (client, 06/10/2026).
ALTER TABLE "trainers" ADD COLUMN "verrouille" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "verrouilleLe" TIMESTAMP(3);
