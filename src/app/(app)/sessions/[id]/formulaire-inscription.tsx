"use client";

import type { TypeFinancement } from "@prisma/client";
import Link from "next/link";
import { useActionState, useState } from "react";

import { ChampsFacturation } from "@/app/(app)/_composants/champs-facturation";
import { BoutonEnvoyer, MessageErreur } from "@/app/(app)/_composants/formulaire";
import { inscrireApprenant, type EtatFormulaire } from "@/app/(app)/sessions/actions";
import { payeurParDefaut } from "@/lib/inscriptions-facturation";

type Props = {
  sessionId: string;
  /// Prix de la session, proposé comme tarif de l'apprenant
  prixParDefaut: string | null;
  /// La session a une entreprise cliente : l'entreprise peut toujours payer
  entrepriseSession: boolean;
  candidats: { id: string; libelle: string; financement: TypeFinancement; aUneEntreprise: boolean }[];
  financeursConnus: string[];
};

/// Inscription d'un apprenant depuis la session, avec sa facturation : à qui
/// facturer et à quel tarif, proposés d'après sa fiche et le prix de la session.
export function FormulaireInscription({ sessionId, prixParDefaut, entrepriseSession, candidats, financeursConnus }: Props) {
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

  // La clé change à chaque inscription réussie : le formulaire se vide et la
  // liste se reconstruit sans l'apprenant qui vient d'être ajouté.
  return (
    <Formulaire
      key={candidats.length}
      sessionId={sessionId}
      prixParDefaut={prixParDefaut}
      entrepriseSession={entrepriseSession}
      candidats={candidats}
      financeursConnus={financeursConnus}
      envoyer={envoyer}
      erreur={etat.erreur}
    />
  );
}

function Formulaire({
  sessionId,
  prixParDefaut,
  entrepriseSession,
  candidats,
  financeursConnus,
  envoyer,
  erreur,
}: Props & { envoyer: (donnees: FormData) => void; erreur?: string }) {
  const [learnerId, setLearnerId] = useState("");
  const candidat = candidats.find((c) => c.id === learnerId);

  return (
    <form action={envoyer} className="border-t border-bordure-douce pt-3">
      <input type="hidden" name="sessionId" value={sessionId} />
      <label htmlFor="learnerId" className="block text-[12.5px] font-semibold">
        Inscrire un apprenant
      </label>
      <select
        id="learnerId"
        name="learnerId"
        value={learnerId}
        onChange={(e) => setLearnerId(e.target.value)}
        className="mt-1.5 w-full rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent-pale"
      >
        <option value="">Choisir…</option>
        {candidats.map((c) => (
          <option key={c.id} value={c.id}>
            {c.libelle}
          </option>
        ))}
      </select>
      {candidat && (
        <div className="mt-3">
          <ChampsFacturation
            key={candidat.id}
            payeur={payeurParDefaut(candidat.financement, candidat.aUneEntreprise || entrepriseSession)}
            prix={prixParDefaut}
            financeursConnus={financeursConnus}
          />
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <BoutonEnvoyer libelle="Inscrire" />
        <MessageErreur message={erreur} />
      </div>
    </form>
  );
}
