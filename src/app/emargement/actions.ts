"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { enregistrerSignature } from "@/lib/emargement-numerique";
import { jourDepuisSaisie } from "@/lib/sessions-libelles";

export type EtatSignature = { erreur?: string; signee?: boolean };

const schema = z.object({
  jeton: z.string().min(1).max(100),
  jour: z.string(),
  creneau: z.enum(["MATIN", "APRES_MIDI"]),
  signature: z.string().startsWith("data:image/png;base64,").max(420_000),
});

/// Signature d'une demi-journée, sans compte : le jeton du lien personnel
/// fait office d'autorisation, pour ce seul participant et cette session.
export async function signerEmargement(_precedent: EtatSignature, donnees: FormData): Promise<EtatSignature> {
  const r = schema.safeParse({
    jeton: donnees.get("jeton"),
    jour: donnees.get("jour"),
    creneau: donnees.get("creneau"),
    signature: donnees.get("signature"),
  });
  const jour = r.success ? jourDepuisSaisie(r.data.jour) : null;
  if (!r.success || !jour) return { erreur: "Signature incomplète : tracez votre signature, puis validez." };

  // Éléments de preuve : l'adresse réseau et l'appareil d'où part la signature.
  const entetes = await headers();
  const ip = entetes.get("x-forwarded-for")?.split(",")[0]?.trim() || entetes.get("x-real-ip");
  const image = new Uint8Array(Buffer.from(r.data.signature.slice("data:image/png;base64,".length), "base64"));

  const resultat = await enregistrerSignature({
    jeton: r.data.jeton,
    jour,
    creneau: r.data.creneau,
    image,
    ip,
    appareil: entetes.get("user-agent"),
  });
  if (resultat.erreur) return { erreur: resultat.erreur };
  revalidatePath(`/emargement/${r.data.jeton}`);
  return { signee: true };
}
