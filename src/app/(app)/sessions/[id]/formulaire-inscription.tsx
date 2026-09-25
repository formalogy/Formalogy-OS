"use client";

import Link from "next/link";
import { useActionState } from "react";

import { BoutonEnvoyer, MessageErreur } from "@/app/(app)/_composants/formulaire";
import { inscrireApprenant, type EtatFormulaire } from "@/app/(app)/sessions/actions";

type Props = {
  sessionId: string;
  /// Prix de la session, proposé comme tarif de l'apprenant
  prixParDefaut: string | null;
  candidats: { id: string; libelle: string }[];
};

export function FormulaireInscription({ sessionId, prixParDefaut, candidats }: Props) {
  const [etat, envoyer] = useActionState<EtatFormulaire, FormData>(inscrireApprenant, {});

  if (candidats.length === 0) {
    return (
      <p className="border-t border-bordure-douce pt-3 text-[12px] text-texte-tenu">
        Tous les apprenants enregistrés sont déjà inscrits.{" "}
        <Link href="/apprenants/nouveau" className="font-semibold text-accent-fort hover:underline">
          Créer un apprenant
        </Link>
      </p>
    );
  }

  return (
    <form action={envoyer} className="border-t border-bordure-douce pt-3">
      <input type="hidden" name="sessionId" value={sessionId} />
      <label htmlFor="learnerId" className="block text-[12.5px] font-semibold">
        Inscrire un apprenant
      </label>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        {/* La clé change à chaque inscription réussie : la liste se vide et se
            reconstruit sans l'apprenant qui vient d'être ajouté. */}
        <select
          key={candidats.length}
          id="learnerId"
          name="learnerId"
          defaultValue=""
          className="min-w-0 flex-1 rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent-pale"
        >
          <option value="">Choisir…</option>
          {candidats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.libelle}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-[12.5px] text-texte-doux">
          Tarif
          <input
            key={candidats.length}
            name="prixHT"
            inputMode="decimal"
            required
            defaultValue={prixParDefaut?.replace(".", ",") ?? ""}
            aria-label="Tarif HT de l'apprenant"
            className="w-24 rounded-lg border border-bordure bg-surface px-2 py-2 text-right font-mono text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent-pale"
          />
          € HT
        </label>
        <BoutonEnvoyer libelle="Inscrire" />
      </div>
      <div className="mt-2">
        <MessageErreur message={etat.erreur} />
      </div>
    </form>
  );
}
