"use client";

import { useActionState, useState } from "react";

import { BoutonEnvoyer, MessageErreur } from "@/app/(app)/_composants/formulaire";
import { ajouterPaiement, emettreFacture, type EtatFormulaire } from "@/app/(app)/factures/actions";
import { LIBELLE_MOYEN, MOYENS_PAIEMENT } from "@/lib/factures";

const CHAMP =
  "mt-1.5 w-full rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] font-normal outline-none focus:border-accent focus:ring-2 focus:ring-accent-pale";

export function EmissionFacture({ id, aujourdhui, echeanceParDefaut }: { id: string; aujourdhui: string; echeanceParDefaut: string }) {
  const [etat, envoyer] = useActionState<EtatFormulaire, FormData>(emettreFacture, {});
  const v = (nom: string, defaut = "") => etat.valeurs?.[nom] ?? defaut;

  return (
    <form action={envoyer} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />
      <ol className="list-decimal pl-5 text-[12.5px] text-texte-doux">
        <li>Créez la facture dans Henrri avec les montants ci-dessus.</li>
        <li>Reportez ici le numéro attribué par Henrri et joignez le PDF.</li>
      </ol>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-[12.5px] font-semibold">
          Numéro Henrri
          <input name="numero" required defaultValue={v("numero")} placeholder="F-2026-0042" className={CHAMP} />
        </label>
        <label className="block text-[12.5px] font-semibold">
          Date d&apos;émission
          <input name="dateEmission" type="date" required max={aujourdhui} defaultValue={v("dateEmission", aujourdhui)} className={CHAMP} />
        </label>
        <label className="block text-[12.5px] font-semibold">
          Échéance
          <input name="dateEcheance" type="date" required defaultValue={v("dateEcheance", echeanceParDefaut)} className={CHAMP} />
        </label>
      </div>
      <label className="block text-[12.5px] font-semibold">
        PDF de la facture <span className="font-normal text-texte-tenu">(recommandé)</span>
        <input name="fichier" type="file" accept=".pdf,application/pdf" className="mt-1.5 block w-full text-[12.5px] file:mr-3 file:rounded-lg file:border file:border-bordure file:bg-surface-creuse file:px-3 file:py-1.5 file:font-semibold" />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <BoutonEnvoyer libelle="Enregistrer l'émission" />
        <MessageErreur message={etat.erreur} />
      </div>
    </form>
  );
}

export function SaisiePaiement({ factureId, reste, aujourdhui }: { factureId: string; reste: string; aujourdhui: string }) {
  const [ouvert, setOuvert] = useState(false);
  const [etat, envoyer] = useActionState<EtatFormulaire, FormData>(ajouterPaiement, {});
  const v = (nom: string, defaut = "") => etat.valeurs?.[nom] ?? defaut;

  if (!ouvert) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setOuvert(true)} className="rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-white">
          Enregistrer un paiement
        </button>
        {etat.succes && <span className="text-[12.5px] font-semibold text-succes">{etat.succes}</span>}
      </div>
    );
  }

  return (
    <form
      action={envoyer}
      className="flex flex-col gap-3 border-t border-bordure-douce pt-3"
    >
      <input type="hidden" name="factureId" value={factureId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-[12.5px] font-semibold">
          Montant (€)
          <input name="montant" required inputMode="decimal" defaultValue={v("montant", reste)} className={CHAMP} />
        </label>
        <label className="block text-[12.5px] font-semibold">
          Date d&apos;encaissement
          <input name="date" type="date" required max={aujourdhui} defaultValue={v("date", aujourdhui)} className={CHAMP} />
        </label>
        <label className="block text-[12.5px] font-semibold">
          Moyen
          <select key={v("moyen", "VIREMENT")} name="moyen" defaultValue={v("moyen", "VIREMENT")} className={CHAMP}>
            {MOYENS_PAIEMENT.map((m) => (
              <option key={m} value={m}>{LIBELLE_MOYEN[m]}</option>
            ))}
          </select>
        </label>
        <label className="block text-[12.5px] font-semibold">
          Référence <span className="font-normal text-texte-tenu">(facultatif)</span>
          <input name="reference" defaultValue={v("reference")} placeholder="N° de chèque, libellé du virement…" className={CHAMP} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <BoutonEnvoyer libelle="Enregistrer" />
        <button type="button" onClick={() => setOuvert(false)} className="text-[12.5px] font-semibold text-texte-doux">Fermer</button>
        {etat.succes && <span className="text-[12.5px] font-semibold text-succes">{etat.succes}</span>}
        <MessageErreur message={etat.erreur} />
      </div>
    </form>
  );
}
