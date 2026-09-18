"use client";

import { useActionState } from "react";

import { BoutonEnvoyer, Champ, MessageErreur } from "@/app/(app)/_composants/formulaire";
import { modifierOrganisme, type EtatFormulaire } from "@/app/(app)/parametres/actions";

export function FormulaireOrganisme({ initiales, lectureSeule }: { initiales: Record<string, string>; lectureSeule: boolean }) {
  const [etat, envoyer] = useActionState<EtatFormulaire, FormData>(modifierOrganisme, {});
  const v = (nom: string) => etat.valeurs?.[nom] ?? initiales[nom];

  return (
    <form action={envoyer} className="max-w-3xl rounded-xl border border-bordure bg-surface p-5 shadow-sm">
      <fieldset disabled={lectureSeule}>
        {lectureSeule && (
          <p className="mb-4 rounded-lg bg-surface-creuse px-3 py-2 text-[12px] text-texte-doux">
            Consultation seule : la modification est réservée aux administrateurs.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Champ nom="raisonSociale" libelle="Raison sociale" obligatoire valeurParDefaut={v("raisonSociale")} />
          </div>
          <Champ nom="siret" libelle="SIRET" placeholder="14 chiffres" valeurParDefaut={v("siret")} />
          <Champ
            nom="numeroDeclaration"
            libelle="Numéro de déclaration d'activité"
            placeholder="11 chiffres"
            aide="Attribué par la DREETS. Obligatoire sur les attestations."
            valeurParDefaut={v("numeroDeclaration")}
          />
          <div className="sm:col-span-2">
            <Champ nom="adresse" libelle="Adresse" valeurParDefaut={v("adresse")} />
          </div>
          <Champ nom="codePostal" libelle="Code postal" valeurParDefaut={v("codePostal")} />
          <Champ nom="ville" libelle="Ville" valeurParDefaut={v("ville")} />
          <Champ nom="telephone" libelle="Téléphone" valeurParDefaut={v("telephone")} />
          <Champ nom="email" libelle="Email de contact" type="email" valeurParDefaut={v("email")} />
          <Champ nom="siteWeb" libelle="Site web" valeurParDefaut={v("siteWeb")} />
        </div>

        <h2 className="mb-1 mt-6 text-[13px] font-bold uppercase tracking-wider text-texte-tenu">Signataire des attestations</h2>
        <p className="mb-3 text-[12px] text-texte-tenu">Personne qui atteste la réalisation des formations, en général le dirigeant.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ nom="representantNom" libelle="Prénom et nom" valeurParDefaut={v("representantNom")} />
          <Champ nom="representantFonction" libelle="Fonction" placeholder="Dirigeant" valeurParDefaut={v("representantFonction")} />
        </div>

        <h2 className="mb-1 mt-6 text-[13px] font-bold uppercase tracking-wider text-texte-tenu">Certification Qualiopi</h2>
        <p className="mb-3 text-[12px] text-texte-tenu">Rappelées sur l&apos;écran Qualiopi, pour ne pas manquer l&apos;audit de surveillance.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ nom="qualiopiCertificateur" libelle="Organisme certificateur" placeholder="Ex. : AFNOR Certification" valeurParDefaut={v("qualiopiCertificateur")} />
          <Champ nom="qualiopiObtentionAt" libelle="Date d'obtention" type="date" valeurParDefaut={v("qualiopiObtentionAt")} />
          <Champ nom="qualiopiExpireAt" libelle="Fin de validité" type="date" valeurParDefaut={v("qualiopiExpireAt")} />
          <Champ nom="qualiopiProchainAuditAt" libelle="Prochain audit" type="date" valeurParDefaut={v("qualiopiProchainAuditAt")} />
        </div>

        {!lectureSeule && (
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <BoutonEnvoyer libelle="Enregistrer" />
            {etat.succes && <span className="text-[12.5px] font-semibold text-succes">{etat.succes}</span>}
            <MessageErreur message={etat.erreur} />
          </div>
        )}
      </fieldset>
    </form>
  );
}
