"use client";

import { useActionState, useState } from "react";

import { BoutonEnvoyer, MessageErreur } from "@/app/(app)/_composants/formulaire";
import { envoyerEmailApprenant, type EtatEnvoi } from "@/app/(app)/apprenants/actions";

type ModeleRendu = { id: string; nom: string; sujet: string; corps: string; manquantes: string[] };

type Props = {
  learnerId: string;
  email: string | null;
  modeles: ModeleRendu[];
  envoiReel: boolean;
};

const CHAMP =
  "mt-1 w-full rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] font-normal outline-none focus:border-accent focus:ring-2 focus:ring-accent-pale";

export function EnvoiEmail({ learnerId, email, modeles, envoiReel }: Props) {
  const [ouvert, setOuvert] = useState(false);
  const [modeleId, setModeleId] = useState("");
  const [sujet, setSujet] = useState("");
  const [corps, setCorps] = useState("");
  const [etat, envoyer] = useActionState<EtatEnvoi, FormData>(async (precedent, donnees) => {
    const resultat = await envoyerEmailApprenant(precedent, donnees);
    if (resultat.succes) {
      setOuvert(false);
      setModeleId("");
      setSujet("");
      setCorps("");
    }
    return resultat;
  }, {});

  if (!email) {
    return <p className="text-[12.5px] text-texte-tenu">Pas d&apos;adresse email sur la fiche : envoi impossible.</p>;
  }

  if (!ouvert) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setOuvert(true)} className="rounded-lg border border-bordure bg-surface px-3 py-1.5 text-[12.5px] font-semibold">
          Écrire un email
        </button>
        {etat.succes && <span className="text-[12.5px] font-semibold text-succes">{etat.succes}</span>}
      </div>
    );
  }

  const choisi = modeles.find((m) => m.id === modeleId);

  return (
    <form action={envoyer} className="flex flex-col gap-3 border-t border-bordure-douce pt-3">
      <input type="hidden" name="learnerId" value={learnerId} />
      <input type="hidden" name="templateId" value={modeleId} />

      <label className="text-[12.5px] font-semibold">
        Partir d&apos;un modèle
        <select
          value={modeleId}
          onChange={(e) => {
            const m = modeles.find((x) => x.id === e.target.value);
            setModeleId(e.target.value);
            if (m) {
              setSujet(m.sujet);
              setCorps(m.corps);
            }
          }}
          className={CHAMP}
        >
          <option value="">Message libre</option>
          {modeles.map((m) => (
            <option key={m.id} value={m.id}>{m.nom}</option>
          ))}
        </select>
      </label>

      {choisi && choisi.manquantes.length > 0 && (
        <p className="rounded-lg bg-alerte/12 px-3 py-2 text-[12px] text-alerte">
          Informations absentes pour cet apprenant, remplacées par « non précisé » : {choisi.manquantes.join(", ")}. Relisez le message avant l&apos;envoi.
        </p>
      )}

      <p className="text-[12px] text-texte-tenu">À : {email}</p>
      <label className="text-[12.5px] font-semibold">
        Sujet
        <input name="sujet" value={sujet} onChange={(e) => setSujet(e.target.value)} required className={CHAMP} />
      </label>
      <label className="text-[12.5px] font-semibold">
        Message
        <textarea name="corps" value={corps} onChange={(e) => setCorps(e.target.value)} required rows={10} className={`${CHAMP} leading-relaxed`} />
      </label>

      {!envoiReel && (
        <p className="text-[11.5px] text-alerte">Mode simulation : le message sera enregistré, mais pas envoyé.</p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <BoutonEnvoyer libelle={envoiReel ? "Envoyer" : "Enregistrer (simulation)"} />
        <button type="button" onClick={() => setOuvert(false)} className="text-[12.5px] font-semibold text-texte-doux">Annuler</button>
        <MessageErreur message={etat.erreur} />
      </div>
    </form>
  );
}
