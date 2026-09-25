"use client";

import { useState } from "react";

import {
  estFinanceurTiers,
  LIBELLE_PAYEUR_INSCRIPTION,
  PAYEURS_INSCRIPTION,
  type PayeurInscription,
} from "@/lib/inscriptions-facturation";

const CHAMP =
  "mt-1 w-full rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent-pale";
const ETIQUETTE = "block text-[12px] font-semibold";

type Props = {
  payeur: PayeurInscription;
  /// Tarif proposé, au format « 1500.00 »
  prix: string | null;
  financeur?: { nom?: string | null; reference?: string | null; email?: string | null };
  /// Noms proposés pour le financeur (OPCO connus et déjà utilisés)
  financeursConnus: string[];
};

/// Facturation d'une inscription : à qui facturer, à quel tarif, et pour un
/// financeur en subrogation, son nom (celui de la facture) et son dossier.
/// Commun aux deux formulaires d'inscription et à la correction.
export function ChampsFacturation({ payeur: payeurInitial, prix, financeur, financeursConnus }: Props) {
  const [payeur, setPayeur] = useState<PayeurInscription>(payeurInitial);
  const tiers = estFinanceurTiers(payeur);

  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
      <label className={ETIQUETTE}>
        Facturer à
        <select name="facturerA" value={payeur} onChange={(e) => setPayeur(e.target.value as PayeurInscription)} className={CHAMP}>
          {PAYEURS_INSCRIPTION.map((p) => (
            <option key={p} value={p}>
              {LIBELLE_PAYEUR_INSCRIPTION[p]}
            </option>
          ))}
        </select>
      </label>
      <label className={ETIQUETTE}>
        Tarif HT (€)
        <input
          name="prixHT"
          inputMode="decimal"
          required
          defaultValue={prix?.replace(".", ",") ?? ""}
          placeholder="ex. 1 200"
          className={`${CHAMP} text-right font-mono`}
        />
      </label>
      {tiers && (
        // Remonté à chaque changement de payeur : « France Travail » se
        // propose de lui-même, un nom d'OPCO ne reste pas par erreur.
        <div key={payeur} className="grid gap-3 sm:col-span-2 sm:grid-cols-3">
          <label className={ETIQUETTE}>
            Nom du financeur <span className="font-normal text-texte-tenu">(sur la facture)</span>
            <input
              name="financeurNom"
              required
              list="financeurs-connus"
              defaultValue={financeur?.nom ?? (payeur === "FRANCE_TRAVAIL" ? "France Travail" : "")}
              placeholder={payeur === "OPCO" ? "ex. OPCO EP" : "ex. France Travail"}
              className={CHAMP}
            />
            <datalist id="financeurs-connus">
              {financeursConnus.map((nom) => (
                <option key={nom} value={nom} />
              ))}
            </datalist>
          </label>
          <label className={ETIQUETTE}>
            N° de dossier <span className="font-normal text-texte-tenu">(facultatif)</span>
            <input name="financeurReference" defaultValue={financeur?.reference ?? ""} className={CHAMP} />
          </label>
          <label className={ETIQUETTE}>
            Email du contact <span className="font-normal text-texte-tenu">(facultatif)</span>
            <input name="financeurEmail" type="email" defaultValue={financeur?.email ?? ""} className={CHAMP} />
          </label>
        </div>
      )}
    </div>
  );
}
