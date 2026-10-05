"use client";

import { useActionState, useState } from "react";

import {
  BoutonEnvoyer,
  Champ,
  ChampListe,
  MessageErreur,
} from "@/app/(app)/_composants/formulaire";
import { EditeurRiche } from "@/app/(app)/_composants/editeur-riche";
import {
  creerFormation,
  modifierFormation,
  type EtatFormulaire,
} from "@/app/(app)/formations/actions";
import { ChampHoraires } from "@/app/(app)/sessions/champ-horaires";
import {
  LIBELLE_MODALITE,
  LIBELLE_PLATEFORME,
  LIBELLE_STATUT_FORMATION,
  MODALITES,
  STATUTS_FORMATION,
} from "@/lib/formations-libelles";

type Props = {
  categories: { id: string; nom: string }[];
  /// Formateurs actifs, à cocher comme formateurs habituels
  formateurs: { id: string; libelle: string }[];
  /// Valeurs actuelles, en mode modification (formateurs : identifiants
  /// séparés par des virgules)
  initiales?: Record<string, string> & { id: string };
};

function Section({ titre, aide, children }: { titre: string; aide?: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-bordure-douce pt-5 first:border-t-0 first:pt-0">
      <h2 className="text-[13px] font-bold uppercase tracking-wider text-texte-tenu">{titre}</h2>
      {aide && <p className="mt-0.5 text-[12px] text-texte-tenu">{aide}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

/// Fiche du catalogue (refaite le 05/10/2026) : elle porte tout ce qu'une
/// session reprend en étant créée — pas de prix, il se donne par stagiaire.
export function FormulaireFormation({ categories, formateurs, initiales }: Props) {
  const modification = Boolean(initiales);
  const [etat, envoyer] = useActionState<EtatFormulaire, FormData>(
    modification ? modifierFormation : creerFormation,
    {},
  );

  // Après une erreur, on réaffiche ce que l'utilisateur vient de saisir ;
  // sinon, les valeurs enregistrées.
  const v = (nom: string) => etat.valeurs?.[nom] ?? initiales?.[nom];
  const [modalite, setModalite] = useState(v("modalite") ?? "PRESENTIEL");
  const [typeCertif, setTypeCertif] = useState(v("typeCertification") ?? "");
  const [duree, setDuree] = useState({ heures: v("dureeHeures") ?? "", jours: v("dureeJours") ?? "" });
  const coches = new Set((v("formateurs") ?? "").split(",").filter(Boolean));
  const enLigne = modalite === "E_LEARNING" || modalite === "HYBRIDE";
  const nombre = (x: string) => Number(x.replace(",", ".")) || 0;

  const optionsCategorie = [
    { valeur: "", libelle: "Sans catégorie" },
    ...categories.map((c) => ({ valeur: c.id, libelle: c.nom })),
  ];

  return (
    <form
      action={envoyer}
      onChange={(e) => {
        const champ = e.target as unknown as HTMLInputElement;
        if (champ.name === "modalite") setModalite(champ.value);
        if (champ.name === "typeCertification") setTypeCertif(champ.value);
        if (champ.name === "dureeHeures") setDuree((d) => ({ ...d, heures: champ.value }));
        if (champ.name === "dureeJours") setDuree((d) => ({ ...d, jours: champ.value }));
      }}
      className="flex max-w-3xl flex-col gap-5 rounded-xl border border-bordure bg-surface p-5 shadow-sm"
    >
      {initiales && <input type="hidden" name="id" value={initiales.id} />}

      <Section titre="Formation">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Champ nom="titre" libelle="Titre" obligatoire valeurParDefaut={v("titre")} />
          </div>
          <Champ nom="reference" libelle="Référence" obligatoire placeholder="BUR-EXC-02" aide="Code interne unique" valeurParDefaut={v("reference")} />
          <ChampListe nom="categoryId" libelle="Catégorie" options={optionsCategorie} valeurParDefaut={v("categoryId") ?? ""} />
          <ChampListe
            nom="modalite"
            libelle="Modalité"
            options={MODALITES.map((m) => ({ valeur: m, libelle: LIBELLE_MODALITE[m] }))}
            valeurParDefaut={v("modalite") ?? "PRESENTIEL"}
          />
          <ChampListe
            nom="statut"
            libelle="Statut"
            options={STATUTS_FORMATION.map((s) => ({ valeur: s, libelle: LIBELLE_STATUT_FORMATION[s] }))}
            valeurParDefaut={v("statut") ?? "BROUILLON"}
          />
        </div>
      </Section>

      <Section titre="Durée et organisation" aide="Reprises d'office par chaque session de cette formation.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ nom="dureeHeures" libelle="Durée en heures" placeholder="14" valeurParDefaut={v("dureeHeures")} />
          {!enLigne && <Champ nom="dureeJours" libelle="Durée en jours" placeholder="2" valeurParDefaut={v("dureeJours")} />}
          {enLigne ? (
            <>
              <ChampListe
                nom="plateforme"
                libelle="Plateforme en ligne"
                options={[{ valeur: "", libelle: "Gérée par le formateur" }, ...Object.entries(LIBELLE_PLATEFORME).map(([valeur, libelle]) => ({ valeur, libelle }))]}
                valeurParDefaut={v("plateforme") ?? ""}
              />
              <Champ nom="dureeAccesMois" libelle="Durée d'accès (mois)" placeholder="3" aide="Période laissée au stagiaire pour suivre son parcours." valeurParDefaut={v("dureeAccesMois") ?? "3"} />
            </>
          ) : (
            <ChampHoraires
              valeurParDefaut={v("horaires")}
              nombreJours={Math.round(nombre(duree.jours))}
              dureeFormation={duree.heures ? nombre(duree.heures) : null}
              enLigne={false}
            />
          )}
        </div>
      </Section>

      <Section titre="Certification" aide="Classe la formation dans le BPF et figure sur les documents.">
        <div className="grid gap-4 sm:grid-cols-3">
          <ChampListe
            nom="typeCertification"
            libelle="Type"
            options={[
              { valeur: "", libelle: "Non certifiante" },
              { valeur: "RS", libelle: "Répertoire spécifique (RS)" },
              { valeur: "RNCP", libelle: "RNCP" },
            ]}
            valeurParDefaut={v("typeCertification") ?? ""}
          />
          {typeCertif && (
            <Champ nom="certification" libelle="Code / intitulé" placeholder={typeCertif === "RS" ? "RS6289 — TOSA Excel" : "RNCP37682"} valeurParDefaut={v("certification")} />
          )}
          {typeCertif === "RNCP" && <Champ nom="niveauCertification" libelle="Niveau" placeholder="5" valeurParDefaut={v("niveauCertification")} />}
        </div>
      </Section>

      <Section titre="Formateurs habituels" aide="Proposés d'office sur les sessions de cette formation ; chacun y apporte son programme.">
        {formateurs.length === 0 ? (
          <p className="text-[12.5px] text-texte-tenu">Aucun formateur actif pour l&apos;instant.</p>
        ) : (
          <div className="grid gap-1.5 sm:grid-cols-2">
            {formateurs.map((f) => (
              <label key={f.id} className="flex items-center gap-2 text-[13px]">
                <input type="checkbox" name="formateurs" value={f.id} defaultChecked={coches.has(f.id)} />
                {f.libelle}
              </label>
            ))}
          </div>
        )}
      </Section>

      <Section titre="Contenu pédagogique">
        <div className="grid gap-4">
          <EditeurRiche nom="description" libelle="Description" valeurParDefaut={v("description")} />
          <EditeurRiche nom="objectifs" libelle="Objectifs pédagogiques" valeurParDefaut={v("objectifs")} />
          <EditeurRiche nom="programme" libelle="Programme" valeurParDefaut={v("programme")} />
          <EditeurRiche nom="competences" libelle="Compétences visées" valeurParDefaut={v("competences")} />
          <div className="grid gap-4 sm:grid-cols-2">
            <EditeurRiche nom="publicVise" libelle="Public visé" valeurParDefaut={v("publicVise")} />
            <EditeurRiche nom="prerequis" libelle="Prérequis" valeurParDefaut={v("prerequis")} />
          </div>
        </div>
      </Section>

      <Section titre="Méthodes et évaluation" aide="Repris dans la convention et attendus par Qualiopi.">
        <div className="grid gap-4">
          <EditeurRiche nom="methodes" libelle="Méthodes et moyens pédagogiques" valeurParDefaut={v("methodes")} />
          <EditeurRiche nom="evaluation" libelle="Modalités d'évaluation" valeurParDefaut={v("evaluation")} />
          <EditeurRiche nom="accessibilite" libelle="Accessibilité et délai d'accès" valeurParDefaut={v("accessibilite")} />
        </div>
      </Section>

      <div className="flex flex-wrap items-center gap-3">
        <BoutonEnvoyer libelle={modification ? "Enregistrer les modifications" : "Ajouter au catalogue"} />
        <MessageErreur message={etat.erreur} />
      </div>
    </form>
  );
}
