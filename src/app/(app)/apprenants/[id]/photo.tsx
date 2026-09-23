"use client";

import { useActionState, useState } from "react";

import { Avatar } from "@/app/(app)/_composants/avatar";
import { BoutonEnvoyer, MessageErreur } from "@/app/(app)/_composants/formulaire";
import {
  deposerPhotoApprenant,
  retirerPhotoApprenant,
  type EtatFormulaire,
} from "@/app/(app)/apprenants/actions";

type Props = {
  id: string;
  prenom: string;
  nom: string;
  /// Pour l'affichage de l'avatar : photo déposée à la main, ou à défaut
  /// piste Gravatar à essayer (peut échouer et retomber sur les initiales).
  photoUrl: string | null;
  /// Pour les boutons : une photo a-t-elle été déposée à la main (distinct
  /// de l'avatar automatique Gravatar, qui ne se « retire » pas).
  aUnePhoto: boolean;
};

export function PhotoApprenant({ id, prenom, nom, photoUrl, aUnePhoto }: Props) {
  const [ouvert, setOuvert] = useState(false);
  const [etat, envoyer] = useActionState<EtatFormulaire, FormData>(deposerPhotoApprenant, {});

  return (
    <div className="flex items-center gap-4">
      <Avatar prenom={prenom} nom={nom} photoUrl={photoUrl} taille="lg" />

      {ouvert ? (
        <form action={envoyer} className="flex flex-col items-start gap-2">
          <input type="hidden" name="id" value={id} />
          <input
            name="fichier"
            type="file"
            required
            accept="image/png,image/jpeg"
            className="block text-[12px] file:mr-3 file:rounded-lg file:border file:border-bordure file:bg-surface-creuse file:px-2.5 file:py-1 file:text-[12px] file:font-semibold"
          />
          <div className="flex items-center gap-3">
            <BoutonEnvoyer libelle="Enregistrer" />
            <button type="button" onClick={() => setOuvert(false)} className="text-[12px] font-semibold text-texte-doux">
              Annuler
            </button>
          </div>
          <MessageErreur message={etat.erreur} />
        </form>
      ) : (
        <div className="flex flex-col items-start gap-1.5">
          <button
            type="button"
            onClick={() => setOuvert(true)}
            className="rounded-lg border border-bordure bg-surface px-3 py-1.5 text-[12.5px] font-semibold"
          >
            {aUnePhoto ? "Changer la photo" : "Ajouter une photo"}
          </button>
          {aUnePhoto && (
            <form action={retirerPhotoApprenant}>
              <input type="hidden" name="id" value={id} />
              <button type="submit" className="text-[12px] font-semibold text-texte-doux hover:text-danger">
                Retirer la photo
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
