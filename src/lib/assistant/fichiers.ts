import "server-only";

import { z } from "zod";

import { stockage } from "@/lib/stockage";

/// PDF transmis à l'assistant : rangés à part dans le stockage, sous un
/// identifiant tiré par le serveur (jamais un chemin venu du navigateur).
export const schemaFichierAssistant = z.object({ id: z.uuid(), nom: z.string().trim().min(1).max(200) });
export type FichierAssistant = z.infer<typeof schemaFichierAssistant>;

export function cheminFichierAssistant(id: string) {
  return `assistant/${id}.pdf`;
}

export async function lireFichierAssistant(id: string): Promise<Uint8Array> {
  const blob = await stockage().lire(cheminFichierAssistant(z.uuid().parse(id)));
  return new Uint8Array(await blob.arrayBuffer());
}
