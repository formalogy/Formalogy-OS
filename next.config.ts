import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // En développement, un téléphone du même Wi-Fi ouvre les liens d'émargement
  // et de questionnaire par l'adresse du Mac (ADRESSE_PUBLIQUE, voir
  // lib/adresse-publique.ts) : le serveur doit l'accepter.
  allowedDevOrigins: process.env.ADRESSE_PUBLIQUE ? [new URL(process.env.ADRESSE_PUBLIQUE).hostname] : [],
  experimental: {
    serverActions: {
      // Les documents déposés font jusqu'à 15 Mo (voir TAILLE_MAX_OCTETS) ;
      // la limite par défaut de 1 Mo refuserait la plupart des PDF scannés.
      // La marge couvre l'enveloppe du formulaire envoyé.
      bodySizeLimit: "16mb",
    },
  },
};

export default nextConfig;
