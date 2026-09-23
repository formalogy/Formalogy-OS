"use client";

import { useState } from "react";

function initiales(prenom: string, nom: string): string {
  return `${prenom[0] ?? ""}${nom[0] ?? ""}`.toUpperCase();
}

const TAILLES = {
  sm: "size-9 text-[12px]",
  md: "size-12 text-[15px]",
  lg: "size-20 text-[24px]",
} as const;

type Props = {
  prenom: string;
  nom: string;
  /// URL à essayer (photo déposée à la main ou Gravatar) ; null si aucune
  /// piste n'existe, pour éviter une requête inutile.
  photoUrl?: string | null;
  taille?: keyof typeof TAILLES;
};

/// Avatar rond : photo si elle charge, sinon initiales sur fond de couleur
/// (même esprit que le rond du menu utilisateur). L'URL peut échouer (photo
/// supprimée, pas de Gravatar) : on bascule alors sur les initiales sans rien
/// montrer de cassé.
export function Avatar({ prenom, nom, photoUrl, taille = "sm" }: Props) {
  const [enErreur, setEnErreur] = useState(false);
  const classeTaille = TAILLES[taille];

  if (photoUrl && !enErreur) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- servie par notre API, pas un asset statique optimisable
      <img
        src={photoUrl}
        alt=""
        onError={() => setEnErreur(true)}
        className={`shrink-0 rounded-full object-cover ${classeTaille}`}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full bg-accent font-titre font-semibold text-white ${classeTaille}`}
    >
      {initiales(prenom, nom)}
    </div>
  );
}
