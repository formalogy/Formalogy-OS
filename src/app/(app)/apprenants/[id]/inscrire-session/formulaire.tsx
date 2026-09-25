"use client";

import type { TypeFinancement } from "@prisma/client";
import Link from "next/link";
import { useActionState, useState } from "react";

import { ChampsFacturation } from "@/app/(app)/_composants/champs-facturation";
import { BoutonEnvoyer, MessageErreur } from "@/app/(app)/_composants/formulaire";
import { inscrireApprenantEtVoirFiche } from "@/app/(app)/sessions/actions";
import type { EtatFormulaire } from "@/app/(app)/sessions/actions";
import { payeurParDefaut } from "@/lib/inscriptions-facturation";

type Props = {
  learnerId: string;
  financement: TypeFinancement;
  aUneEntreprise: boolean;
  /// `prix` : prix de la session, proposé comme tarif ; `entreprise` : la
  /// session a une entreprise cliente
  candidats: { id: string; libelle: string; prix: string | null; entreprise: boolean }[];
  financeursConnus: string[];
};

/// Inscription de l'apprenant à une session, avec sa facturation : à qui
/// facturer et à quel tarif, proposés d'après sa fiche et la session choisie.
export function FormulaireInscriptionApprenant({ learnerId, financement, aUneEntreprise, candidats, financeursConnus }: Props) {
  const [etat, envoyer] = useActionState<EtatFormulaire, FormData>(inscrireApprenantEtVoirFiche, {});
  const [sessionId, setSessionId] = useState("");
  const session = candidats.find((c) => c.id === sessionId);

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
        value={sessionId}
        onChange={(e) => setSessionId(e.target.value)}
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
      {session && (
        <div className="mt-4">
          <ChampsFacturation
            key={session.id}
            payeur={payeurParDefaut(financement, aUneEntreprise || session.entreprise)}
            prix={session.prix}
            financeursConnus={financeursConnus}
          />
          <p className="mt-2 text-[11.5px] text-texte-tenu">
            Proposés d&apos;après la fiche de l&apos;apprenant et le prix de la session, modifiables. Le tarif est le montant
            facturé pour cet apprenant.
          </p>
        </div>
      )}
      <div className="mt-4 flex items-center gap-3">
        <BoutonEnvoyer libelle="Inscrire" />
        <MessageErreur message={etat.erreur} />
      </div>
    </form>
  );
}
