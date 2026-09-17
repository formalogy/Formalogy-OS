"use client";

import { useActionState, useState } from "react";

import { BoutonEnvoyer, MessageErreur } from "@/app/(app)/_composants/formulaire";
import {
  annulerSignature,
  deposerDocumentSigne,
  marquerSignatureEnvoyee,
  preparerSignature,
  type EtatFormulaire,
} from "@/app/(app)/signatures/actions";
import { NOMBRE_MAX_SIGNATAIRES, type Signataire } from "@/lib/signatures/libelles";

const CHAMP =
  "w-full rounded-lg border border-bordure bg-surface px-2.5 py-1.5 text-[12.5px] font-normal outline-none focus:border-accent focus:ring-2 focus:ring-accent-pale";

export function PreparationSignature({ documentId, suggestions }: { documentId: string; suggestions: Signataire[] }) {
  const [ouvert, setOuvert] = useState(false);
  const [etat, envoyer] = useActionState<EtatFormulaire, FormData>(preparerSignature, {});

  if (!ouvert) {
    return (
      <button type="button" onClick={() => setOuvert(true)} className="rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-white">
        Faire signer ce document
      </button>
    );
  }

  const v = (cle: string, defaut = "") => etat.valeurs?.[cle] ?? defaut;

  return (
    <form action={envoyer} className="flex flex-col gap-2">
      <input type="hidden" name="documentId" value={documentId} />
      <p className="text-[12px] text-texte-tenu">Qui doit signer ? Ces informations servent au suivi ; vous les reporterez dans BoldSign.</p>
      {Array.from({ length: NOMBRE_MAX_SIGNATAIRES }, (_, i) => (
        <div key={i} className="grid grid-cols-2 gap-2">
          <input name={`nom_${i}`} aria-label={`Nom du signataire ${i + 1}`} placeholder="Prénom Nom" defaultValue={v(`nom_${i}`, suggestions[i]?.nom)} className={CHAMP} />
          <input name={`email_${i}`} type="email" aria-label={`Email du signataire ${i + 1}`} placeholder="email@exemple.fr" defaultValue={v(`email_${i}`, suggestions[i]?.email)} className={CHAMP} />
        </div>
      ))}
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <BoutonEnvoyer libelle="Créer la référence" />
        <button type="button" onClick={() => setOuvert(false)} className="text-[12.5px] font-semibold text-texte-doux">Annuler</button>
      </div>
      <MessageErreur message={etat.erreur} />
    </form>
  );
}

export function BoutonCopier({ texte }: { texte: string }) {
  const [copie, setCopie] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(texte);
        setCopie(true);
        setTimeout(() => setCopie(false), 2000);
      }}
      className="shrink-0 rounded-lg border border-bordure bg-surface px-2.5 py-1 text-[12px] font-semibold"
    >
      {copie ? "Copié ✓" : "Copier"}
    </button>
  );
}

export function ActionsSignature({ id, statut }: { id: string; statut: "A_ENVOYER" | "ENVOYEE" }) {
  const [depot, setDepot] = useState(false);
  const [etat, envoyer] = useActionState<EtatFormulaire, FormData>(deposerDocumentSigne, {});

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {statut === "A_ENVOYER" && (
          <form action={marquerSignatureEnvoyee}>
            <input type="hidden" name="id" value={id} />
            <button type="submit" className="rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-white">
              C&apos;est envoyé depuis BoldSign
            </button>
          </form>
        )}
        <button type="button" onClick={() => setDepot(!depot)} className="rounded-lg border border-bordure bg-surface px-3 py-1.5 text-[12.5px] font-semibold">
          Déposer le document signé à la main
        </button>
        <form
          action={annulerSignature}
          onSubmit={(e) => {
            if (!confirm("Annuler cette demande de signature ?")) e.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={id} />
          <button type="submit" className="rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-texte-tenu hover:bg-danger-pale hover:text-danger">
            Annuler la demande
          </button>
        </form>
      </div>

      {depot && (
        <form action={envoyer} className="flex flex-col gap-2 border-t border-bordure-douce pt-3">
          <input type="hidden" name="id" value={id} />
          <label className="text-[12.5px] font-semibold">
            Document signé (PDF)
            <input name="signe" type="file" accept=".pdf,application/pdf" required className="mt-1 block w-full text-[12.5px] file:mr-3 file:rounded-lg file:border file:border-bordure file:bg-surface-creuse file:px-3 file:py-1.5 file:font-semibold" />
          </label>
          <label className="text-[12.5px] font-semibold">
            Preuve de signature (PDF « Audit Trail ») <span className="font-normal text-texte-tenu">(facultatif mais recommandé)</span>
            <input name="preuve" type="file" accept=".pdf,application/pdf" className="mt-1 block w-full text-[12.5px] file:mr-3 file:rounded-lg file:border file:border-bordure file:bg-surface-creuse file:px-3 file:py-1.5 file:font-semibold" />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <BoutonEnvoyer libelle="Enregistrer comme signé" />
          </div>
          <MessageErreur message={etat.erreur} />
        </form>
      )}
    </div>
  );
}
