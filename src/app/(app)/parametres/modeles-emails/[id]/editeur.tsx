"use client";

import { useActionState, useState } from "react";

import { BoutonEnvoyer, MessageErreur } from "@/app/(app)/_composants/formulaire";
import { modifierModele, type EtatFormulaire } from "@/app/(app)/parametres/actions";
import { rendre, VARIABLES_DISPONIBLES, variablesInconnues } from "@/lib/emails/modeles";

/// Valeurs d'exemple pour l'aperçu. Clairement fictives.
const EXEMPLE: Record<string, string> = {
  "organisme.nom": "Formalogy",
  "apprenant.prenom": "Camille",
  "apprenant.nom": "Exemple",
  "session.numero": "S-2026-0000",
  "session.formation": "Excel — niveau intermédiaire",
  "session.dates": "12–13 oct. 2026",
  "session.horaires": "9h00–12h30 / 13h30–17h00",
  "session.lieu": "12 rue de l'Exemple, Lille",
  "session.modalite": "Présentiel",
  "session.formateur": "Alex Exemple",
  "entreprise.nom": "Entreprise Exemple",
  "prospect.nomComplet": "Dominique Exemple",
  "dossier.financeur": "OPCO EP",
  "dossier.reference": "D-2026-0001",
  "questionnaire.lien": "https://…/questionnaire/exemple",
};

const CHAMP =
  "mt-1.5 w-full rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] font-normal outline-none focus:border-accent focus:ring-2 focus:ring-accent-pale disabled:bg-surface-creuse";

type Props = {
  lectureSeule: boolean;
  initial: { id: string; nom: string; description: string; sujet: string; corps: string; actif: boolean };
};

export function EditeurModele({ lectureSeule, initial }: Props) {
  const [etat, envoyer] = useActionState<EtatFormulaire, FormData>(modifierModele, {});
  const [sujet, setSujet] = useState(initial.sujet);
  const [corps, setCorps] = useState(initial.corps);

  const inconnues = variablesInconnues(`${sujet}\n${corps}`);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <form action={envoyer} className="rounded-xl border border-bordure bg-surface p-5 shadow-sm">
        <input type="hidden" name="id" value={initial.id} />
        <fieldset disabled={lectureSeule} className="flex flex-col gap-4">
          {lectureSeule && (
            <p className="rounded-lg bg-surface-creuse px-3 py-2 text-[12px] text-texte-doux">
              Consultation seule : la modification des modèles est réservée aux administrateurs.
            </p>
          )}
          <label className="block text-[12.5px] font-semibold">
            Nom
            <input name="nom" defaultValue={etat.valeurs?.nom ?? initial.nom} className={CHAMP} />
          </label>
          <label className="block text-[12.5px] font-semibold">
            Description <span className="font-normal text-texte-tenu">(facultatif)</span>
            <input name="description" defaultValue={etat.valeurs?.description ?? initial.description} className={CHAMP} />
          </label>
          <label className="block text-[12.5px] font-semibold">
            Sujet
            <input name="sujet" value={sujet} onChange={(e) => setSujet(e.target.value)} className={CHAMP} />
          </label>
          <label className="block text-[12.5px] font-semibold">
            Message
            <textarea name="corps" rows={14} value={corps} onChange={(e) => setCorps(e.target.value)} className={`${CHAMP} font-mono text-[12.5px] leading-relaxed`} />
          </label>
          <label className="flex items-center gap-2 text-[12.5px] font-semibold">
            <input type="checkbox" name="actif" defaultChecked={initial.actif} />
            Modèle actif
          </label>

          {inconnues.length > 0 && (
            <p className="rounded-lg bg-danger-pale px-3 py-2 text-[12px] text-danger">
              Variable inconnue : {inconnues.map((v) => `{{${v}}}`).join(", ")}
            </p>
          )}

          {!lectureSeule && (
            <div className="flex flex-wrap items-center gap-3">
              <BoutonEnvoyer libelle="Enregistrer" />
              <MessageErreur message={etat.erreur} />
              {etat.succes && <span className="text-[12.5px] font-semibold text-succes">{etat.succes}</span>}
            </div>
          )}
        </fieldset>
      </form>

      <div className="flex flex-col gap-4">
        <section className="overflow-hidden rounded-xl border border-bordure bg-surface shadow-sm">
          <div className="border-b border-bordure-douce px-4 py-3">
            <h2 className="text-[14.5px] font-bold">Aperçu</h2>
            <p className="text-[11.5px] text-texte-tenu">Avec des valeurs d&apos;exemple fictives.</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-[12px] text-texte-tenu">Sujet</p>
            <p className="text-[13.5px] font-semibold">{rendre(sujet, EXEMPLE).resultat}</p>
            <p className="mt-3 whitespace-pre-line border-t border-bordure-douce pt-3 text-[13px] leading-relaxed">
              {rendre(corps, EXEMPLE).resultat}
            </p>
          </div>
        </section>

        <section className="rounded-xl border border-bordure bg-surface p-4 shadow-sm">
          <h2 className="mb-2 text-[13px] font-bold">Variables disponibles</h2>
          <ul className="grid gap-1">
            {Object.entries(VARIABLES_DISPONIBLES).map(([nom, description]) => (
              <li key={nom} className="flex items-baseline justify-between gap-3 text-[12px]">
                <code className="font-mono text-accent-fort">{`{{${nom}}}`}</code>
                <span className="text-right text-texte-tenu">{description}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
