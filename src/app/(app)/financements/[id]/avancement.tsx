"use client";

import { useState, useTransition } from "react";

import { MessageErreur } from "@/app/(app)/_composants/formulaire";
import { changerStatutDossier, type EtatFormulaire } from "@/app/(app)/financements/actions";

const CHAMP =
  "mt-1.5 w-full rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] font-normal outline-none focus:border-accent focus:ring-2 focus:ring-accent-pale";

type Etape = "DEPOSE" | "ACCORDE" | "REFUSE" | "ANNULE" | "A_MONTER";

/// Étapes proposées selon l'état du dossier : on n'accorde pas un dossier
/// qui n'a pas été déposé.
export function AvancementDossier({ id, statut, aujourdhui, montantDemande }: { id: string; statut: string; aujourdhui: string; montantDemande: string }) {
  const [etat, setEtat] = useState<EtatFormulaire>({});
  const [etape, setEtape] = useState<Etape | null>(null);
  const [enCours, demarrer] = useTransition();

  // Étape confirmée : on referme le formulaire pour proposer les suivantes.
  const envoyer = (donnees: FormData) =>
    demarrer(async () => {
      const resultat = await changerStatutDossier({}, donnees);
      setEtat(resultat);
      if (resultat.succes) setEtape(null);
    });

  const possibles: { valeur: Etape; libelle: string }[] =
    statut === "A_MONTER"
      ? [
          { valeur: "DEPOSE", libelle: "Marquer comme déposé" },
          { valeur: "ANNULE", libelle: "Annuler le dossier" },
        ]
      : statut === "DEPOSE"
        ? [
            { valeur: "ACCORDE", libelle: "Accord reçu" },
            { valeur: "REFUSE", libelle: "Refus reçu" },
            { valeur: "A_MONTER", libelle: "Revenir à « à déposer »" },
            { valeur: "ANNULE", libelle: "Annuler le dossier" },
          ]
        : [{ valeur: "A_MONTER", libelle: "Rouvrir le dossier" }];

  if (!etape) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          {possibles.map((p) => (
            <button
              key={p.valeur}
              type="button"
              onClick={() => setEtape(p.valeur)}
              className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold ${p.valeur === "ANNULE" ? "text-texte-tenu hover:bg-danger-pale hover:text-danger" : "border border-bordure bg-surface"}`}
            >
              {p.libelle}
            </button>
          ))}
        </div>
        {etat.succes && <span className="text-[12.5px] font-semibold text-succes">{etat.succes}</span>}
      </div>
    );
  }

  return (
    <form action={envoyer} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="statut" value={etape} />
      {etape === "DEPOSE" && (
        <label className="block text-[12.5px] font-semibold">
          Date de dépôt
          <input name="dateDepot" type="date" required max={aujourdhui} defaultValue={etat.valeurs?.dateDepot ?? aujourdhui} className={CHAMP} />
        </label>
      )}
      {(etape === "ACCORDE" || etape === "REFUSE") && (
        <label className="block text-[12.5px] font-semibold">
          Date de la réponse
          <input name="dateReponse" type="date" required max={aujourdhui} defaultValue={etat.valeurs?.dateReponse ?? aujourdhui} className={CHAMP} />
        </label>
      )}
      {etape === "ACCORDE" && (
        <label className="block text-[12.5px] font-semibold">
          Montant accordé (€)
          <input name="montantAccorde" required inputMode="decimal" defaultValue={etat.valeurs?.montantAccorde ?? montantDemande} className={CHAMP} />
        </label>
      )}
      {etape === "REFUSE" && (
        <label className="block text-[12.5px] font-semibold">
          Motif du refus
          <input name="motifRefus" required defaultValue={etat.valeurs?.motifRefus} placeholder="Ex. : dossier déposé hors délai" className={CHAMP} />
        </label>
      )}
      {(etape === "ANNULE" || etape === "A_MONTER") && (
        <p className="text-[12.5px] text-texte-doux">
          {etape === "ANNULE" ? "Le dossier sera marqué annulé, sans être supprimé." : "Les dates et montants de réponse seront effacés."}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={enCours} className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white transition disabled:opacity-60">
          {enCours ? "Enregistrement…" : "Confirmer"}
        </button>
        <button type="button" onClick={() => setEtape(null)} className="text-[12.5px] font-semibold text-texte-doux">Annuler</button>
        <MessageErreur message={etat.erreur} />
      </div>
    </form>
  );
}
