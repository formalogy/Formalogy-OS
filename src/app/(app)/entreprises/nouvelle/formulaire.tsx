"use client";

import { useActionState, useRef, useState, useTransition } from "react";

import { BoutonEnvoyer, Champ, ChampLong, MessageErreur } from "@/app/(app)/_composants/formulaire";
import {
  creerEntreprise,
  modifierEntreprise,
  rechercherEntrepriseParSiret,
  type EtatFormulaire,
} from "@/app/(app)/entreprises/actions";
import type { EntrepriseTrouvee } from "@/lib/annuaire-entreprises";

const ETAT_INITIAL: EtatFormulaire = {};

/// Champs que l'annuaire des entreprises sait remplir, avec leur libellé.
const CHAMPS_ANNUAIRE: [keyof EntrepriseTrouvee & string, string][] = [
  ["raisonSociale", "raison sociale"],
  ["adresse", "adresse"],
  ["codePostal", "code postal"],
  ["ville", "ville"],
  ["codeApe", "code APE"],
];

type Recherche =
  | { etat: "attente" }
  | { etat: "en_cours" }
  | { etat: "trouvee"; entreprise: EntrepriseTrouvee; completes: string[]; differents: number }
  | { etat: "erreur"; message: string };

/// Fiche entreprise, en création comme en modification (`entreprise` fourni).
/// À la saisie du SIRET, l'annuaire public des entreprises est interrogé et
/// les champs encore vides se remplissent d'eux-mêmes.
export function FormulaireEntreprise({ entreprise }: { entreprise?: Record<string, string> & { id: string } }) {
  const [etat, envoyer] = useActionState(entreprise ? modifierEntreprise : creerEntreprise, ETAT_INITIAL);
  const formulaire = useRef<HTMLFormElement>(null);
  const [recherche, setRecherche] = useState<Recherche>({ etat: "attente" });
  const [enCours, demarrer] = useTransition();
  const dernierNumero = useRef<string | null>(null);
  const v = (nom: string) => etat.valeurs?.[nom] ?? entreprise?.[nom];

  const champ = (nom: string) => formulaire.current?.elements.namedItem(nom) as HTMLInputElement | null;

  /// Remplit les champs vides (ou tous, pour « Remplacer ») avec les données
  /// de l'annuaire, et dit lesquels ont changé.
  function remplir(trouvee: EntrepriseTrouvee, remplacer: boolean) {
    const completes: string[] = [];
    let differents = 0;
    for (const [nom, libelle] of CHAMPS_ANNUAIRE) {
      const valeur = trouvee[nom];
      const input = champ(nom);
      if (!input || typeof valeur !== "string" || !valeur) continue;
      if (!input.value.trim() || remplacer) {
        if (input.value !== valeur) completes.push(libelle);
        input.value = valeur;
      } else if (input.value.trim().toUpperCase() !== valeur.toUpperCase()) {
        differents++;
      }
    }
    // Un SIREN (9 chiffres) devient le SIRET du siège.
    const siret = champ("siret");
    if (siret && siret.value.replace(/\s/g, "") !== trouvee.siret) siret.value = trouvee.siret;
    setRecherche({ etat: "trouvee", entreprise: trouvee, completes, differents });
  }

  function rechercher(numero: string) {
    const propre = numero.replace(/\s/g, "");
    if (!/^\d{9}(\d{5})?$/.test(propre)) {
      setRecherche({ etat: "erreur", message: "Saisissez les 14 chiffres du SIRET (ou les 9 du SIREN)." });
      return;
    }
    dernierNumero.current = propre;
    setRecherche({ etat: "en_cours" });
    demarrer(async () => {
      const r = await rechercherEntrepriseParSiret(propre);
      if (r.entreprise) remplir(r.entreprise, false);
      else setRecherche({ etat: "erreur", message: r.erreur ?? "Recherche impossible." });
    });
  }

  return (
    <form ref={formulaire} action={envoyer} className="max-w-2xl rounded-xl border border-bordure bg-surface p-5 shadow-sm">
      {entreprise && <input type="hidden" name="id" value={entreprise.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Champ nom="raisonSociale" valeurParDefaut={v("raisonSociale")} libelle="Raison sociale" obligatoire />
        </div>

        <div>
          <label htmlFor="siret" className="block text-[12.5px] font-semibold">
            SIRET <span className="ml-1 font-normal text-texte-tenu">(facultatif)</span>
          </label>
          <div className="mt-1.5 flex gap-2">
            <input
              id="siret"
              name="siret"
              inputMode="numeric"
              defaultValue={v("siret")}
              placeholder="12345678900012"
              // Les 14 chiffres saisis, l'annuaire est interrogé sans attendre.
              onChange={(e) => {
                const propre = e.target.value.replace(/\s/g, "");
                if (/^\d{14}$/.test(propre) && propre !== dernierNumero.current) rechercher(propre);
              }}
              className="min-w-0 flex-1 rounded-lg border border-bordure bg-surface px-3 py-2 font-mono text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent-pale"
            />
            <button
              type="button"
              disabled={enCours}
              onClick={() => rechercher(champ("siret")?.value ?? "")}
              className="shrink-0 rounded-lg border border-bordure px-3 py-2 text-[12.5px] font-semibold text-accent-fort hover:bg-surface-creuse disabled:opacity-60"
            >
              {enCours ? "Recherche…" : "Rechercher"}
            </button>
          </div>
          <p className="mt-1 text-[11.5px] text-texte-tenu">14 chiffres : la fiche se remplit d&apos;après l&apos;annuaire des entreprises.</p>
        </div>
        <Champ nom="codeApe" valeurParDefaut={v("codeApe")} libelle="Code APE" placeholder="8559A" aide="4 chiffres et une lettre" />

        {recherche.etat !== "attente" && (
          <div
            role="status"
            className={`rounded-lg px-3 py-2 text-[12.5px] sm:col-span-2 ${
              recherche.etat === "erreur" ? "bg-danger-pale text-danger" : recherche.etat === "en_cours" ? "bg-surface-creuse text-texte-doux" : "bg-succes/10 text-succes"
            }`}
          >
            {recherche.etat === "en_cours" && "Recherche dans l'annuaire des entreprises…"}
            {recherche.etat === "erreur" && recherche.message}
            {recherche.etat === "trouvee" && (
              <>
                <strong>Trouvée : {recherche.entreprise.raisonSociale}</strong>
                {recherche.completes.length > 0
                  ? ` — complété : ${recherche.completes.join(", ")}. Vérifiez avant d'enregistrer.`
                  : " — aucun champ vide à compléter."}
                {!recherche.entreprise.enActivite && (
                  <span className="block font-semibold text-alerte">Attention : cet établissement est fermé d&apos;après l&apos;annuaire.</span>
                )}
                {recherche.differents > 0 && (
                  <button
                    type="button"
                    onClick={() => remplir(recherche.entreprise, true)}
                    className="ml-1 font-semibold text-accent-fort underline"
                  >
                    Remplacer par les données de l&apos;annuaire
                  </button>
                )}
              </>
            )}
          </div>
        )}

        <div className="sm:col-span-2">
          <Champ nom="adresse" valeurParDefaut={v("adresse")} libelle="Adresse" />
        </div>
        <Champ nom="codePostal" valeurParDefaut={v("codePostal")} libelle="Code postal" />
        <Champ nom="ville" valeurParDefaut={v("ville")} libelle="Ville" />
        <Champ nom="telephone" valeurParDefaut={v("telephone")} libelle="Téléphone" type="tel" />
        <Champ nom="email" valeurParDefaut={v("email")} libelle="Email" type="email" />
        <Champ nom="siteWeb" valeurParDefaut={v("siteWeb")} libelle="Site web" />
        <div className="sm:col-span-2">
          <ChampLong nom="notes" libelle="Notes" valeurParDefaut={v("notes")} />
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <BoutonEnvoyer libelle={entreprise ? "Enregistrer les modifications" : "Créer l'entreprise"} />
        <MessageErreur message={etat.erreur} />
      </div>
    </form>
  );
}
