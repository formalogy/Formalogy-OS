import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
