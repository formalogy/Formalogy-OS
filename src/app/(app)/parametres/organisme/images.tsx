"use client";

import { useActionState, useRef, useState } from "react";

import { BoutonEnvoyer, MessageErreur } from "@/app/(app)/_composants/formulaire";
import { deposerImageOrganisme, retirerImageOrganisme, type EtatFormulaire } from "@/app/(app)/parametres/actions";

/// Un scan de signature arrive presque toujours sur fond blanc. Posé tel quel
/// sur un document, il masque ce qu'il recouvre d'un rectangle blanc. On rend
/// donc transparents les pixels les plus clairs, dans le navigateur, avant
/// même l'envoi : rien à installer sur le serveur, et le fichier stocké est
/// directement le bon.
const SEUIL_CLARTE = 225;

async function detourerFond(fichier: File): Promise<File> {
  const image = new Image();
  image.src = URL.createObjectURL(fichier);
  try {
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const contexte = canvas.getContext("2d");
    if (!contexte) return fichier;

    contexte.drawImage(image, 0, 0);
    const donnees = contexte.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = donnees.data;
    for (let i = 0; i < pixels.length; i += 4) {
      const clarte = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
      if (clarte >= SEUIL_CLARTE) {
        pixels[i + 3] = 0;
      } else if (clarte > SEUIL_CLARTE - 40) {
        // Bordure du trait : rendue partiellement transparente pour éviter
        // l'effet de découpe à l'emporte-pièce.
        pixels[i + 3] = Math.round(((SEUIL_CLARTE - clarte) / 40) * 255);
      }
    }
    contexte.putImageData(donnees, 0, 0);

    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
    if (!blob) return fichier;
    return new File([blob], "signature.png", { type: "image/png" });
  } catch {
    // Image illisible par le navigateur : on envoie le fichier d'origine,
    // le serveur refusera proprement si le format ne convient pas.
    return fichier;
  } finally {
    URL.revokeObjectURL(image.src);
  }
}

type Props = {
  /// « signature » ou « logo » : détermine le champ visé et la route d'aperçu.
  image: "signature" | "logo";
  titre: string;
  description: string;
  presente: boolean;
  /// Un scan de signature arrive sur fond blanc ; un logo est en général déjà
  /// détouré. La case est donc cochée d'avance pour l'un, pas pour l'autre.
  detourageParDefaut: boolean;
};

export function ImageOrganisme({ image, titre, description, presente, detourageParDefaut }: Props) {
  const [etat, envoyer] = useActionState<EtatFormulaire, FormData>(deposerImageOrganisme, {});
  const [apercu, setApercu] = useState<string | null>(null);
  const [detourage, setDetourage] = useState(detourageParDefaut);
  const champ = useRef<HTMLInputElement>(null);

  async function choisir(fichier: File | undefined) {
    if (!fichier) return setApercu(null);
    const prete = detourage ? await detourerFond(fichier) : fichier;
    setApercu(URL.createObjectURL(prete));
    // On remet dans le champ le fichier réellement envoyé.
    const transfert = new DataTransfer();
    transfert.items.add(prete);
    if (champ.current) champ.current.files = transfert.files;
  }

  return (
    <section className="max-w-3xl rounded-xl border border-bordure bg-surface p-5 shadow-sm">
      <h2 className="text-[15px] font-bold">{titre}</h2>
      <p className="mb-4 mt-1 text-[12.5px] text-texte-doux">{description}</p>

      <div className="flex flex-wrap items-start gap-5">
        <div className="flex h-28 w-64 shrink-0 items-center justify-center rounded-lg border border-dashed border-bordure bg-[repeating-conic-gradient(var(--color-surface-creuse)_0_25%,transparent_0_50%)] bg-[length:16px_16px] p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={apercu ?? `/api/organisme/image?nom=${image}`}
            alt={titre}
            className="max-h-full max-w-full object-contain"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
            }}
          />
          {!presente && !apercu && <span className="absolute text-[12px] text-texte-tenu">Aucune image</span>}
        </div>

        <form action={envoyer} className="flex-1">
          <input type="hidden" name="image" value={image} />
          <label htmlFor={`fichier-${image}`} className="block text-[12.5px] font-semibold">
            Déposer une image (PNG ou JPG, 2 Mo maximum)
          </label>
          <input
            ref={champ}
            id={`fichier-${image}`}
            name="fichier"
            type="file"
            accept="image/png,image/jpeg"
            required
            onChange={(e) => choisir(e.currentTarget.files?.[0])}
            className="mt-1.5 block w-full text-[12.5px] file:mr-3 file:rounded-lg file:border file:border-bordure file:bg-surface-creuse file:px-3 file:py-1.5 file:text-[12.5px] file:font-semibold"
          />
          <label className="mt-2 flex items-center gap-2 text-[12.5px]">
            <input type="checkbox" checked={detourage} onChange={(e) => setDetourage(e.currentTarget.checked)} />
            Retirer le fond blanc
          </label>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <BoutonEnvoyer libelle="Enregistrer" />
            {presente && (
              <button
                type="submit"
                formAction={retirerImageOrganisme}
                formNoValidate
                className="rounded-lg border border-bordure bg-surface px-3 py-2 text-[12.5px] font-semibold text-danger"
              >
                Retirer
              </button>
            )}
            <MessageErreur message={etat.erreur} />
            {etat.succes && <span className="text-[12.5px] font-semibold text-succes">{etat.succes}</span>}
          </div>
        </form>
      </div>
    </section>
  );
}
