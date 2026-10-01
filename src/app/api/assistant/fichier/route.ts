import { randomUUID } from "node:crypto";

import { cheminFichierAssistant } from "@/lib/assistant/fichiers";
import { verifierFichier } from "@/lib/documents-depot";
import { lireUtilisateur } from "@/lib/session";
import { stockage } from "@/lib/stockage";

/// PDF transmis à l'assistant IA (un programme de formation à mettre au
/// format de l'application). Rangé dans le stockage privé, il est relu par le
/// serveur à chaque échange : le navigateur ne garde que sa référence.
export async function POST(request: Request) {
  const utilisateur = await lireUtilisateur();
  if (!utilisateur) return Response.json({ erreur: "Connexion requise." }, { status: 401 });
  if (utilisateur.role !== "ADMIN" && utilisateur.role !== "GESTIONNAIRE") {
    return Response.json({ erreur: "Accès refusé." }, { status: 403 });
  }

  const donnees = await request.formData().catch(() => null);
  const fichier = await verifierFichier(donnees?.get("fichier") ?? null);
  if (typeof fichier === "string") return Response.json({ erreur: fichier }, { status: 400 });
  if (fichier.typeMime !== "application/pdf") {
    return Response.json({ erreur: "L'assistant lit les programmes au format PDF uniquement." }, { status: 400 });
  }

  const id = randomUUID();
  try {
    await stockage().deposer(cheminFichierAssistant(id), fichier.octets, fichier.typeMime);
  } catch {
    return Response.json({ erreur: "Le fichier n'a pas pu être enregistré. Réessayez." }, { status: 502 });
  }
  return Response.json({ id, nom: fichier.nomFichier });
}
