"use client";

import { useActionState, useState } from "react";

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
import { adresseEntreprise } from "@/lib/entreprises-adresse";
import { LIBELLE_MODALITE, LIBELLE_PLATEFORME, MODALITES } from "@/lib/formations-libelles";
import { LIBELLE_STATUT_SESSION, STATUTS_PROPOSES } from "@/lib/sessions-libelles";

type Props = {
  formations: { id: string; titre: string; reference: string; modalite: string }[];
  entreprises: { id: string; raisonSociale: string; adresse: string | null; codePostal: string | null; ville: string | null }[];
  formateurs: { id: string; libelle: string; programmes: { id: string; nom: string }[]; modalite: string | null; lieu: string | null; lieuEntreprise: boolean }[];
  /// Valeurs enregistrées : leur présence met le formulaire en mode modification
  initiales?: Record<string, string> & { id: string };
  /// Pré-remplissage d'une création (depuis une fiche formation ou entreprise)
  valeursDeDepart?: Record<string, string>;
};

export function FormulaireSession({ formations, entreprises, formateurs, initiales, valeursDeDepart }: Props) {
  const modification = Boolean(initiales);
  const [etat, envoyer] = useActionState<EtatFormulaire, FormData>(
    modification ? modifierSession : creerSession,
    {},
  );
  const v = (nom: string) => etat.valeurs?.[nom] ?? initiales?.[nom] ?? valeursDeDepart?.[nom];
  const [modalite, setModalite] = useState(v("modalite") ?? "PRESENTIEL");
  const [attribution, setAttribution] = useState(v("attribution") ?? "FORMATEUR");
  const [formateurId, setFormateurId] = useState(v("trainerId") ?? "");
  const programmes = formateurs.find((f) => f.id === formateurId)?.programmes ?? [];

  /// Lieu de la session d'après le formateur : son adresse de formation, ou
  /// l'adresse de l'entreprise cliente quand il forme sur place. Un lieu déjà
  /// saisi n'est remplacé qu'au changement d'entreprise (formateur « sur place »).
  function remplirLieu(form: HTMLFormElement | null, formateur: (typeof formateurs)[number] | undefined, changementEntreprise = false) {
    if (!form || !formateur || attribution === "FORMALOGY" || formateur.modalite !== "PRESENTIEL") return;
    const lieu = form.elements.namedItem("lieu") as HTMLInputElement | null;
    if (!lieu) return;
    if (formateur.lieuEntreprise) {
      const id = (form.elements.namedItem("companyId") as HTMLSelectElement | null)?.value;
      const entreprise = entreprises.find((e) => e.id === id);
      const adresse = entreprise ? adresseEntreprise(entreprise) : null;
      if (adresse && (changementEntreprise || !lieu.value.trim())) lieu.value = adresse;
      else if (!adresse && !lieu.value.trim()) lieu.value = "Au sein de l'entreprise";
    } else if (formateur.lieu && !changementEntreprise && !lieu.value.trim()) {
      lieu.value = formateur.lieu;
    }
  }

  return (
    <form
      action={envoyer}
      onChange={(e) => {
        const champ = e.target as unknown as HTMLSelectElement;
        if (champ.name === "modalite") setModalite(champ.value);
        if (champ.name === "attribution") setAttribution(champ.value);
        if (champ.name === "trainerId") {
          setFormateurId(champ.value);
          // Sa façon habituelle de travailler devient la modalité proposée
          // (une session Formalogy reste en ligne).
          const choisi = formateurs.find((f) => f.id === champ.value);
          const liste = champ.form?.elements.namedItem("modalite") as HTMLSelectElement | null;
          if (choisi?.modalite && attribution !== "FORMALOGY" && liste) {
            liste.value = choisi.modalite;
            setModalite(choisi.modalite);
          }
          remplirLieu(champ.form, choisi);
        }
        // Formateur qui forme au sein de l'entreprise : le lieu suit
        // l'entreprise cliente choisie.
        if (champ.name === "companyId") remplirLieu(champ.form, formateurs.find((f) => f.id === formateurId), true);
      }}
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
        {attribution === "FORMALOGY" && modalite !== "E_LEARNING" && modalite !== "HYBRIDE" && (
          <p className="text-[11.5px] text-alerte sm:col-span-2">Une session Formalogy est en e-learning ou hybride.</p>
        )}
        {/* Le statut ne se choisit pas à la création : une nouvelle session
            est un brouillon, qui ne déclenche rien. Le bouton « Lancer le
            déroulement automatique », sur la fiche, la met en route. */}
        {modification && (
          <ChampListe
            nom="statut"
            libelle="Statut"
            options={STATUTS_PROPOSES.map((s) => ({ valeur: s, libelle: LIBELLE_STATUT_SESSION[s] }))}
            valeurParDefaut={v("statut") ?? "BROUILLON"}
          />
        )}
        <ChampListe
          nom="attribution"
          libelle="Session attribuée à"
          options={[
            { valeur: "FORMATEUR", libelle: "Le formateur" },
            { valeur: "FORMALOGY", libelle: "Formalogy (formation en interne)" },
          ]}
          valeurParDefaut={v("attribution") ?? "FORMATEUR"}
        />
        <ChampListe
          nom="trainerId"
          libelle="Formateur"
          options={[
            { valeur: "", libelle: "Choisir le formateur…" },
            ...formateurs.map((f) => ({ valeur: f.id, libelle: f.libelle })),
          ]}
          valeurParDefaut={v("trainerId") ?? ""}
        />
        {formateurId && (
          programmes.length > 0 ? (
            <ChampListe
              // Recréé à chaque changement de formateur : sa liste change.
              key={formateurId}
              nom="programmeId"
              libelle="Programme de formation"
              options={[
                ...(programmes.length > 1 ? [{ valeur: "", libelle: "Choisir le programme…" }] : []),
                ...programmes.map((p) => ({ valeur: p.id, libelle: p.nom })),
              ]}
              valeurParDefaut={programmes.some((p) => p.id === v("programmeId")) ? v("programmeId") : programmes.length === 1 ? programmes[0].id : ""}
            />
          ) : (
            <p className="self-end text-[11.5px] text-alerte">
              Aucun programme déposé pour ce formateur (fiche du formateur → documents, type « Programme ») : rien ne sera joint aux emails de bienvenue.
            </p>
          )
        )}
        {attribution === "FORMALOGY" && (
          <ChampListe
            nom="plateforme"
            libelle="Plateforme e-learning"
            options={[
              { valeur: "", libelle: "Choisir…" },
              ...Object.entries(LIBELLE_PLATEFORME).map(([valeur, libelle]) => ({ valeur, libelle })),
            ]}
            valeurParDefaut={v("plateforme") ?? ""}
          />
        )}
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
