"use client";

import Link from "next/link";
import { useActionState } from "react";

import { BoutonEnvoyer, MessageErreur } from "@/app/(app)/_composants/formulaire";
import { inscrireApprenantEtVoirFiche } from "@/app/(app)/sessions/actions";
import type { EtatFormulaire } from "@/app/(app)/sessions/actions";

type Props = {
  learnerId: string;
  candidats: { id: string; libelle: string }[];
};

export function FormulaireInscriptionApprenant({ learnerId, candidats }: Props) {
  const [etat, envoyer] = useActionState<EtatFormulaire, FormData>(inscrireApprenantEtVoirFiche, {});

  if (candidats.length === 0) {
    return (
      <p className="text-[13px] text-texte-doux">
        Aucune session en cours ou à venir pour le moment.{" "}
        <Link href="/sessions/nouvelle" className="font-semibold text-accent-fort hover:underline">
          Programmer une session
        </Link>
      </p>
    );
  }

  return (
    <form action={envoyer}>
      <input type="hidden" name="learnerId" value={learnerId} />
      <label htmlFor="sessionId" className="block text-[12.5px] font-semibold">
        Session
      </label>
      <select
        id="sessionId"
        name="sessionId"
        required
        defaultValue=""
        className="mt-1.5 w-full rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent-pale"
      >
        <option value="" disabled>
          Choisir…
        </option>
        {candidats.map((c) => (
          <option key={c.id} value={c.id}>
            {c.libelle}
          </option>
        ))}
      </select>
      <div className="mt-4 flex items-center gap-3">
        <BoutonEnvoyer libelle="Inscrire" />
        <MessageErreur message={etat.erreur} />
      </div>
    </form>
  );
}
