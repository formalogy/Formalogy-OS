"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { BoutonEnvoyer, MessageErreur } from "@/app/(app)/_composants/formulaire";
import { inscrireApprenantEtVoirFiche } from "@/app/(app)/sessions/actions";
import type { EtatFormulaire } from "@/app/(app)/sessions/actions";

type Props = {
  learnerId: string;
  /// `prix` : prix de la session, proposé comme tarif de l'apprenant
  candidats: { id: string; libelle: string; prix: string | null }[];
};

export function FormulaireInscriptionApprenant({ learnerId, candidats }: Props) {
  const [etat, envoyer] = useActionState<EtatFormulaire, FormData>(inscrireApprenantEtVoirFiche, {});
  // Le tarif proposé suit la session choisie ; il reste modifiable.
  const [tarif, setTarif] = useState("");

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
        onChange={(e) => setTarif(candidats.find((c) => c.id === e.target.value)?.prix?.replace(".", ",") ?? "")}
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
      <label htmlFor="prixHT" className="mt-4 block text-[12.5px] font-semibold">
        Tarif HT de l&apos;apprenant
      </label>
      <div className="mt-1.5 flex items-center gap-2">
        <input
          id="prixHT"
          name="prixHT"
          inputMode="decimal"
          required
          value={tarif}
          onChange={(e) => setTarif(e.target.value)}
          placeholder="ex. 1 200"
          className="w-40 rounded-lg border border-bordure bg-surface px-3 py-2 text-right font-mono text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent-pale"
        />
        <span className="text-[12.5px] text-texte-doux">€ HT — proposé d&apos;après la session, modifiable. C&apos;est le montant de sa facture.</span>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <BoutonEnvoyer libelle="Inscrire" />
        <MessageErreur message={etat.erreur} />
      </div>
    </form>
  );
}
