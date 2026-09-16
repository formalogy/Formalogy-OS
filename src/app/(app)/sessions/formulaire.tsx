"use client";

import { useActionState } from "react";

import {
  BoutonEnvoyer,
  Champ,
  ChampListe,
  ChampLong,
  MessageErreur,
} from "@/app/(app)/_composants/formulaire";
import {
  creerSession,
  modifierSession,
  type EtatFormulaire,
} from "@/app/(app)/sessions/actions";
import { LIBELLE_MODALITE, MODALITES } from "@/lib/formations-libelles";
import { LIBELLE_STATUT_SESSION, STATUTS_SESSION } from "@/lib/sessions-libelles";

type Props = {
  formations: { id: string; titre: string; reference: string; modalite: string }[];
  entreprises: { id: string; raisonSociale: string }[];
  /// Valeurs enregistrées : leur présence met le formulaire en mode modification
  initiales?: Record<string, string> & { id: string };
  /// Pré-remplissage d'une création (depuis une fiche formation ou entreprise)
  valeursDeDepart?: Record<string, string>;
};

export function FormulaireSession({ formations, entreprises, initiales, valeursDeDepart }: Props) {
  const modification = Boolean(initiales);
  const [etat, envoyer] = useActionState<EtatFormulaire, FormData>(
    modification ? modifierSession : creerSession,
    {},
  );
  const v = (nom: string) => etat.valeurs?.[nom] ?? initiales?.[nom] ?? valeursDeDepart?.[nom];

  return (
    <form
      action={envoyer}
      className="max-w-3xl rounded-xl border border-bordure bg-surface p-5 shadow-sm"
    >
      {initiales && <input type="hidden" name="id" value={initiales.id} />}

      {formations.length === 0 && (
        <p className="mb-4 rounded-lg bg-alerte/12 px-3 py-2 text-[12.5px] text-alerte">
          Aucune formation active dans le catalogue. Passez une formation au statut « Active »
          pour pouvoir programmer une session.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <ChampListe
            nom="formationId"
            libelle="Formation"
            options={[
              { valeur: "", libelle: "Choisir une formation…" },
              ...formations.map((f) => ({ valeur: f.id, libelle: `${f.titre} (${f.reference})` })),
            ]}
            valeurParDefaut={v("formationId") ?? ""}
          />
        </div>
        <div className="sm:col-span-2">
          <ChampListe
            nom="companyId"
            libelle="Entreprise cliente"
            options={[
              { valeur: "", libelle: "Aucune — session inter-entreprises ou particuliers" },
              ...entreprises.map((e) => ({ valeur: e.id, libelle: e.raisonSociale })),
            ]}
            valeurParDefaut={v("companyId") ?? ""}
          />
        </div>
        <Champ nom="dateDebut" libelle="Date de début" type="date" obligatoire valeurParDefaut={v("dateDebut")} />
        <Champ nom="dateFin" libelle="Date de fin" type="date" obligatoire valeurParDefaut={v("dateFin")} />
        <Champ
          nom="horaires"
          libelle="Horaires"
          placeholder="9h00–12h30 / 13h30–17h00"
          valeurParDefaut={v("horaires")}
        />
        <Champ nom="lieu" libelle="Lieu" placeholder="Adresse ou lien de visio" valeurParDefaut={v("lieu")} />
        <ChampListe
          nom="modalite"
          libelle="Modalité"
          options={MODALITES.map((m) => ({ valeur: m, libelle: LIBELLE_MODALITE[m] }))}
          valeurParDefaut={v("modalite") ?? "PRESENTIEL"}
        />
        <ChampListe
          nom="statut"
          libelle="Statut"
          options={STATUTS_SESSION.map((s) => ({ valeur: s, libelle: LIBELLE_STATUT_SESSION[s] }))}
          valeurParDefaut={v("statut") ?? "BROUILLON"}
        />
        <Champ
          nom="intervenant"
          libelle="Intervenant"
          aide="Nom du formateur. Sera relié aux fiches formateurs en Phase 10."
          valeurParDefaut={v("intervenant")}
        />
        <Champ nom="placesMax" libelle="Places maximum" placeholder="12" valeurParDefaut={v("placesMax")} />
        <div className="sm:col-span-2">
          <ChampLong nom="notes" libelle="Notes" valeurParDefaut={v("notes")} />
        </div>
      </div>

      {!modification && (
        <p className="mt-4 text-[11.5px] text-texte-tenu">
          Le prix HT de la formation est recopié dans la session au moment de sa création.
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <BoutonEnvoyer libelle={modification ? "Enregistrer les modifications" : "Créer la session"} />
        <MessageErreur message={etat.erreur} />
      </div>
    </form>
  );
}
