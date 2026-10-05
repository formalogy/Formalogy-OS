"use client";

import type { TypeFinancement } from "@prisma/client";
import { useActionState, useState } from "react";

import { ChampsFacturation } from "@/app/(app)/_composants/champs-facturation";
import { BoutonEnvoyer, MessageErreur } from "@/app/(app)/_composants/formulaire";
import { inscrireApprenant, inscrireNouvelApprenant, type EtatFormulaire } from "@/app/(app)/sessions/actions";
import { LIBELLE_FINANCEMENT } from "@/lib/apprenants-libelles";
import { payeurParDefaut } from "@/lib/inscriptions-facturation";

type Candidat = { id: string; libelle: string; financement: TypeFinancement; aUneEntreprise: boolean };

type Props = {
  sessionId: string;
  /// Tarif proposé : le dernier pratiqué pour cette formation (modifiable)
  prixParDefaut: string | null;
  /// La session a une entreprise cliente : l'entreprise peut toujours payer
  entrepriseSession: boolean;
  candidats: Candidat[];
  financeursConnus: string[];
  /// Stagiaire à présélectionner (session créée depuis sa fiche)
  preselection?: string;
};

const CHAMP =
  "mt-1 w-full rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] font-normal outline-none focus:border-accent focus:ring-2 focus:ring-accent-pale";
const simplifier = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/// Ajout d'un participant (client, 05/10/2026) : un stagiaire déjà connu, ou
/// un nouveau créé ici en quelques champs ; puis à qui facturer et son tarif.
export function FormulaireInscription(props: Props) {
  const [mode, setMode] = useState<"existant" | "nouveau">(props.candidats.length === 0 ? "nouveau" : "existant");
  const onglet = (m: typeof mode, libelle: string) => (
    <button
      type="button"
      onClick={() => setMode(m)}
      className={`rounded-full px-3 py-1 text-[12.5px] font-semibold ${mode === m ? "bg-texte text-surface" : "text-texte-doux hover:bg-surface-creuse"}`}
    >
      {libelle}
    </button>
  );
  return (
    <div className="border-t border-bordure-douce pt-3">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-[12.5px] font-semibold">Ajouter un participant :</span>
        {props.candidats.length > 0 && onglet("existant", "Stagiaire existant")}
        {onglet("nouveau", "Nouveau stagiaire")}
      </div>
      {/* La clé change à chaque ajout : le formulaire se vide. */}
      {mode === "existant" ? <Existant key={props.candidats.length} {...props} /> : <Nouveau key={props.candidats.length} {...props} />}
    </div>
  );
}

function Existant({ sessionId, prixParDefaut, entrepriseSession, candidats, financeursConnus, preselection }: Props) {
  const [etat, envoyer] = useActionState<EtatFormulaire, FormData>(inscrireApprenant, {});
  const [recherche, setRecherche] = useState("");
  const [learnerId, setLearnerId] = useState(candidats.some((c) => c.id === preselection) ? (preselection as string) : "");
  const candidat = candidats.find((c) => c.id === learnerId);
  const mots = simplifier(recherche).split(/\s+/).filter(Boolean);
  const visibles = candidats.filter((c) => c.id === learnerId || mots.every((m) => simplifier(c.libelle).includes(m)));

  return (
    <form action={envoyer}>
      <input type="hidden" name="sessionId" value={sessionId} />
      <div className="grid gap-2 sm:grid-cols-[1fr_1.4fr]">
        <input type="search" value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher un nom…" aria-label="Rechercher un stagiaire" className={CHAMP} />
        <select name="learnerId" value={learnerId} onChange={(e) => setLearnerId(e.target.value)} aria-label="Stagiaire" className={CHAMP}>
          <option value="">Choisir… ({visibles.length})</option>
          {visibles.map((c) => (
            <option key={c.id} value={c.id}>
              {c.libelle}
            </option>
          ))}
        </select>
      </div>
      {candidat && (
        <div className="mt-3">
          <ChampsFacturation
            key={candidat.id}
            payeur={payeurParDefaut(candidat.financement, candidat.aUneEntreprise || entrepriseSession)}
            prix={prixParDefaut}
            financeursConnus={financeursConnus}
          />
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <BoutonEnvoyer libelle="Inscrire" />
        <MessageErreur message={etat.erreur} />
      </div>
    </form>
  );
}

function Nouveau({ sessionId, prixParDefaut, entrepriseSession, financeursConnus }: Props) {
  const [etat, envoyer] = useActionState<EtatFormulaire, FormData>(inscrireNouvelApprenant, {});
  const [financement, setFinancement] = useState<TypeFinancement>("CPF");
  const v = (nom: string) => etat.valeurs?.[nom] ?? "";

  return (
    <form action={envoyer}>
      <input type="hidden" name="sessionId" value={sessionId} />
      <div className="grid gap-3 sm:grid-cols-[8rem_1fr_1fr]">
        <label className="text-[12px] font-semibold">
          Civilité
          <select name="civilite" defaultValue={v("civilite")} className={CHAMP}>
            <option value="">—</option>
            <option value="MADAME">Madame</option>
            <option value="MONSIEUR">Monsieur</option>
          </select>
        </label>
        <label className="text-[12px] font-semibold">
          Prénom
          <input name="prenom" required defaultValue={v("prenom")} className={CHAMP} />
        </label>
        <label className="text-[12px] font-semibold">
          Nom
          <input name="nom" required defaultValue={v("nom")} className={CHAMP} />
        </label>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-[12px] font-semibold">
          Email
          <input name="email" type="email" defaultValue={v("email")} className={CHAMP} />
        </label>
        <label className="text-[12px] font-semibold">
          Téléphone
          <input name="telephone" type="tel" defaultValue={v("telephone")} className={CHAMP} />
        </label>
        <label className="text-[12px] font-semibold sm:col-span-2">
          Adresse
          <input name="adresse" defaultValue={v("adresse")} className={CHAMP} />
        </label>
        <label className="text-[12px] font-semibold">
          Code postal
          <input name="codePostal" defaultValue={v("codePostal")} className={CHAMP} />
        </label>
        <label className="text-[12px] font-semibold">
          Ville
          <input name="ville" defaultValue={v("ville")} className={CHAMP} />
        </label>
        <label className="text-[12px] font-semibold">
          Financement
          <select name="financement" value={financement} onChange={(e) => setFinancement(e.target.value as TypeFinancement)} className={CHAMP}>
            {(Object.keys(LIBELLE_FINANCEMENT) as TypeFinancement[]).map((f) => (
              <option key={f} value={f}>
                {LIBELLE_FINANCEMENT[f]}
              </option>
            ))}
          </select>
        </label>
        {financement === "CPF" && (
          <label className="text-[12px] font-semibold">
            N° de dossier CPF
            <input name="numeroDossierCpf" defaultValue={v("numeroDossierCpf")} className={CHAMP} />
          </label>
        )}
      </div>
      <div className="mt-3">
        <ChampsFacturation key={financement} payeur={payeurParDefaut(financement, entrepriseSession)} prix={prixParDefaut} financeursConnus={financeursConnus} />
      </div>
      <p className="mt-2 text-[11.5px] text-texte-tenu">La fiche du stagiaire se complète ensuite depuis son nom (date de naissance, entreprise…).</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <BoutonEnvoyer libelle="Créer et inscrire" />
        <MessageErreur message={etat.erreur} />
      </div>
    </form>
  );
}
