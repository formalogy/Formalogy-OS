"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

import type { ParticipantSuivi, SeanceSuivie } from "@/lib/emargement-numerique";

const ETATS: Record<SeanceSuivie["etat"], { texte: string; ton: string }> = {
  signee: { texte: "A signé", ton: "bg-succes/12 text-succes" },
  ouverte: { texte: "À signer", ton: "bg-accent-pale text-accent-fort" },
  non_signee: { texte: "Non signé", ton: "bg-danger-pale text-danger" },
  absent: { texte: "Absent", ton: "bg-surface-creuse text-texte-doux" },
  a_venir: { texte: "À venir", ton: "bg-surface-creuse text-texte-tenu" },
};

/// Séances passées ou du jour : celles qu'on attend signées.
const attendue = (s: SeanceSuivie) => s.etat === "signee" || s.etat === "non_signee" || s.etat === "ouverte";

function FenetreQr({ participant, fermer }: { participant: ParticipantSuivi; fermer: () => void }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    QRCode.toString(participant.url, { type: "svg", margin: 1, errorCorrectionLevel: "M" }).then(setSvg, () => setSvg(""));
  }, [participant.url]);
  return (
    <div role="dialog" aria-modal="true" aria-label={`QR code de ${participant.nom}`} className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={fermer}>
      <div className="w-full max-w-xs rounded-xl bg-white p-5 text-center text-[#111827] shadow-xl" onClick={(e) => e.stopPropagation()}>
        <p className="text-[16px] font-bold">{participant.nom}</p>
        <p className="text-[12.5px] text-[#4b5563]">Scannez pour signer</p>
        {/* SVG produit ici même à partir du lien : aucun contenu extérieur. */}
        <div className="mx-auto mt-3 w-60" dangerouslySetInnerHTML={{ __html: svg }} />
        <button type="button" onClick={fermer} className="mt-4 rounded-lg border border-[#d1d5db] px-4 py-2 text-[13px] font-semibold">
          Fermer
        </button>
      </div>
    </div>
  );
}

function LigneParticipant({ participant }: { participant: ParticipantSuivi }) {
  const [ouvert, setOuvert] = useState(false);
  const [qr, setQr] = useState(false);
  const [copie, setCopie] = useState(false);
  const attendues = participant.seances.filter(attendue);
  const signees = attendues.filter((s) => s.etat === "signee").length;
  const manquantes = participant.seances.filter((s) => s.etat === "non_signee").length;

  async function copier() {
    try {
      await navigator.clipboard.writeText(participant.url);
      setCopie(true);
      setTimeout(() => setCopie(false), 2000);
    } catch {
      window.prompt("Copiez le lien :", participant.url);
    }
  }

  return (
    <li className="border-t border-bordure-douce first:border-t-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
        <button type="button" onClick={() => setOuvert(!ouvert)} aria-expanded={ouvert} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <span aria-hidden className={`text-[11px] text-texte-tenu transition-transform ${ouvert ? "rotate-90" : ""}`}>
            ▶
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[13.5px] font-semibold">
              {participant.nom}
              {participant.formateur && <span className="ml-2 rounded-full bg-accent-pale px-2 py-0.5 text-[11px] font-semibold text-accent-fort">Formateur</span>}
            </span>
            {participant.detail && !participant.formateur && <span className="block truncate text-[12px] text-texte-tenu">{participant.detail}</span>}
          </span>
        </button>
        <span className={`text-[12.5px] font-semibold ${manquantes > 0 ? "text-danger" : attendues.length > 0 ? "text-succes" : "text-texte-tenu"}`}>
          {attendues.length === 0 ? "Pas encore commencé" : `${signees} / ${attendues.length} signée${attendues.length > 1 ? "s" : ""}`}
        </span>
        <button type="button" onClick={copier} className="rounded-md border border-bordure px-2.5 py-1 text-[12px] font-semibold text-accent-fort hover:bg-surface-creuse">
          {copie ? "Lien copié ✓" : "Copier le lien"}
        </button>
        <button type="button" onClick={() => setQr(true)} className="rounded-md border border-bordure px-2.5 py-1 text-[12px] font-semibold text-accent-fort hover:bg-surface-creuse">
          QR code
        </button>
      </div>

      {ouvert && (
        <ul className="grid gap-2 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-3">
          {participant.seances.map((s) => (
            <li key={s.cle} className="flex items-center gap-3 rounded-lg border border-bordure-douce px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-semibold first-letter:uppercase">{s.libelle}</p>
                <p className="mt-1 flex items-center gap-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${ETATS[s.etat].ton}`}>{ETATS[s.etat].texte}</span>
                  {s.heure && (
                    <span className="text-[11.5px] text-texte-tenu">
                      {s.etat === "signee" ? `à ${s.heure}` : `dès ${s.heure}`}
                    </span>
                  )}
                </p>
              </div>
              {s.signatureId && (
                // eslint-disable-next-line @next/next/no-img-element -- image privée servie par l'application, sans optimisation
                <img src={`/api/emargement/signatures/${s.signatureId}`} alt={`Signature de ${participant.nom}`} className="h-10 w-24 shrink-0 rounded bg-white object-contain" />
              )}
            </li>
          ))}
        </ul>
      )}
      {qr && <FenetreQr participant={participant} fermer={() => setQr(false)} />}
    </li>
  );
}

/// Émargement numérique de la session : pour chaque participant, ses séances
/// signées ou non, son lien personnel et son QR code.
export function SignaturesEmargement({ participants }: { participants: ParticipantSuivi[] }) {
  if (participants.length === 0) {
    return <p className="px-4 py-4 text-[13px] text-texte-tenu">Aucun inscrit pour le moment.</p>;
  }
  return (
    <ul>
      {participants.map((p) => (
        <LigneParticipant key={p.cle} participant={p} />
      ))}
    </ul>
  );
}
