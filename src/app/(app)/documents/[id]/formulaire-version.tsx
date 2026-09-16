"use client";

import { useActionState, useState } from "react";

import { BoutonEnvoyer, MessageErreur } from "@/app/(app)/_composants/formulaire";
import { deposerNouvelleVersion, type EtatFormulaire } from "@/app/(app)/documents/actions";
import { ATTRIBUT_ACCEPT } from "@/lib/documents-libelles";

export function FormulaireVersion({ documentId }: { documentId: string }) {
  const [ouvert, setOuvert] = useState(false);
  const [etat, envoyer] = useActionState<EtatFormulaire, FormData>(deposerNouvelleVersion, {});

  if (!ouvert) {
    return (
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="rounded-lg border border-bordure bg-surface px-3 py-1.5 text-[12.5px] font-semibold"
      >
        Déposer une nouvelle version
      </button>
    );
  }

  return (
    <form action={envoyer} className="border-t border-bordure-douce pt-3">
      <input type="hidden" name="documentId" value={documentId} />
      <label htmlFor="fichier-version" className="block text-[12.5px] font-semibold">
        Nouveau fichier
      </label>
      <input
        id="fichier-version"
        name="fichier"
        type="file"
        required
        accept={ATTRIBUT_ACCEPT}
        className="mt-1.5 block w-full text-[12.5px] file:mr-3 file:rounded-lg file:border file:border-bordure file:bg-surface-creuse file:px-3 file:py-1.5 file:font-semibold"
      />
      <label htmlFor="commentaire" className="mt-3 block text-[12.5px] font-semibold">
        Ce qui a changé <span className="font-normal text-texte-tenu">(facultatif)</span>
      </label>
      <input
        id="commentaire"
        name="commentaire"
        type="text"
        placeholder="Ex. : correction des dates"
        className="mt-1.5 w-full rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent-pale"
      />
      <p className="mt-2 text-[11.5px] text-texte-tenu">
        Les versions précédentes restent conservées et téléchargeables.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <BoutonEnvoyer libelle="Déposer" />
        <button type="button" onClick={() => setOuvert(false)} className="text-[12.5px] font-semibold text-texte-doux">
          Annuler
        </button>
      </div>
      <div className="mt-2">
        <MessageErreur message={etat.erreur} />
      </div>
    </form>
  );
}
