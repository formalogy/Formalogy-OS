"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { signerEmargement, type EtatSignature } from "@/app/emargement/actions";

/// Largeur de l'image conservée : assez pour une signature lisible sur la
/// feuille, assez peu pour rester légère.
const LARGEUR_IMAGE = 600;
/// En deçà de ce tracé (en pixels), ce n'est pas une signature mais un clic.
const TRACE_MINIMUM = 40;

function BoutonValider({ actif }: { actif: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={!actif || pending}
      className="flex-1 rounded-lg bg-accent px-4 py-3 text-[15px] font-bold text-white disabled:opacity-50"
    >
      {pending ? "Enregistrement…" : "Valider ma signature"}
    </button>
  );
}

/// Pavé de signature au doigt (ou à la souris) pour une demi-journée.
export function PaveSignature({
  jeton,
  jour,
  creneau,
  intitule,
  seance,
}: {
  jeton: string;
  jour: string;
  creneau: string;
  intitule: string;
  /// Code de demi-journée du QR code scanné (apprenant)
  seance?: string;
}) {
  const [etat, envoyer] = useActionState<EtatSignature, FormData>(signerEmargement, {});
  const toile = useRef<HTMLCanvasElement>(null);
  const champ = useRef<HTMLInputElement>(null);
  const dernier = useRef<{ x: number; y: number } | null>(null);
  const [trace, setTrace] = useState(0);

  // Toile à la taille réelle de l'écran (écrans haute densité compris), pour
  // un trait net.
  useEffect(() => {
    const canvas = toile.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.6;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111827";
  }, []);

  const position = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  function commencer(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dernier.current = position(e);
    const ctx = e.currentTarget.getContext("2d");
    // Un simple appui laisse un point.
    ctx?.beginPath();
    ctx?.arc(dernier.current.x, dernier.current.y, 1.3, 0, Math.PI * 2);
    ctx?.fill();
  }

  function tracer(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dernier.current) return;
    const ctx = e.currentTarget.getContext("2d");
    const p = position(e);
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(dernier.current.x, dernier.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    const distance = Math.hypot(p.x - dernier.current.x, p.y - dernier.current.y);
    dernier.current = p;
    setTrace((t) => t + distance);
  }

  function effacer() {
    const canvas = toile.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    setTrace(0);
  }

  /// Image conservée : la signature réduite à une largeur fixe, sur fond
  /// transparent, au format PNG.
  function preparer() {
    const canvas = toile.current;
    if (!canvas || !champ.current) return;
    const copie = document.createElement("canvas");
    copie.width = LARGEUR_IMAGE;
    copie.height = Math.round((LARGEUR_IMAGE * canvas.height) / canvas.width);
    copie.getContext("2d")?.drawImage(canvas, 0, 0, copie.width, copie.height);
    champ.current.value = copie.toDataURL("image/png");
  }

  return (
    <form action={envoyer} onSubmit={preparer} className="rounded-xl border border-bordure bg-surface p-4 shadow-sm">
      <input type="hidden" name="jeton" value={jeton} />
      <input type="hidden" name="jour" value={jour} />
      <input type="hidden" name="creneau" value={creneau} />
      {seance && <input type="hidden" name="seance" value={seance} />}
      <input ref={champ} type="hidden" name="signature" />

      <p className="text-[15px] font-bold">{intitule}</p>
      <p className="mt-0.5 text-[13px] text-texte-doux">Signez dans le cadre ci-dessous, avec le doigt ou la souris.</p>
      <canvas
        ref={toile}
        onPointerDown={commencer}
        onPointerMove={tracer}
        onPointerUp={() => (dernier.current = null)}
        onPointerCancel={() => (dernier.current = null)}
        aria-label="Zone de signature"
        className="mt-3 h-44 w-full touch-none rounded-lg border-2 border-dashed border-bordure bg-white"
      />
      <p className="mt-2 text-[12px] text-texte-tenu">En signant, j&apos;atteste ma présence à cette séance.</p>
      {etat.erreur && <p className="mt-2 rounded-lg bg-danger-pale px-3 py-2 text-[13px] font-semibold text-danger">{etat.erreur}</p>}
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={effacer} className="rounded-lg border border-bordure px-4 py-3 text-[14px] font-semibold text-texte-doux">
          Effacer
        </button>
        <BoutonValider actif={trace >= TRACE_MINIMUM} />
      </div>
    </form>
  );
}
