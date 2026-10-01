import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { assistantConfigure, repondre } from "@/lib/assistant/agent";
import { schemaFichierAssistant } from "@/lib/assistant/fichiers";
import { lireUtilisateur } from "@/lib/session";

/// Une réponse de l'assistant peut demander plusieurs lectures de la base,
/// ou la lecture d'un programme PDF.
export const maxDuration = 300;

const schema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(20_000),
        fichiers: z.array(schemaFichierAssistant).max(5).optional(),
      }),
    )
    .min(1)
    .max(60),
});

/// Question posée à l'assistant IA. Réservé à l'équipe (administrateur et
/// gestionnaire) : l'assistant lit toute la base.
export async function POST(request: Request) {
  const utilisateur = await lireUtilisateur();
  if (!utilisateur) return Response.json({ erreur: "Connexion requise." }, { status: 401 });
  if (utilisateur.role !== "ADMIN" && utilisateur.role !== "GESTIONNAIRE") {
    return Response.json({ erreur: "Accès refusé." }, { status: 403 });
  }
  if (!assistantConfigure()) {
    return Response.json({ erreur: "L'assistant n'est pas encore branché : la clé de l'API Anthropic (ANTHROPIC_API_KEY) manque dans la configuration." }, { status: 503 });
  }

  const r = schema.safeParse(await request.json().catch(() => null));
  if (!r.success || r.data.messages[r.data.messages.length - 1].role !== "user") {
    return Response.json({ erreur: "Demande invalide." }, { status: 400 });
  }

  try {
    return Response.json(await repondre(r.data.messages));
  } catch (erreur) {
    console.error("Assistant IA :", erreur);
    let message = "L'assistant a rencontré un problème. Réessayez dans un instant.";
    if (erreur instanceof Anthropic.AuthenticationError) message = "La clé de l'API Anthropic est refusée : vérifiez-la dans la configuration.";
    else if (erreur instanceof Anthropic.RateLimitError) message = "Trop de demandes en même temps : réessayez dans une minute.";
    else if (erreur instanceof Anthropic.APIConnectionError || erreur instanceof Anthropic.InternalServerError) message = "Le service de Claude ne répond pas pour l'instant. Réessayez dans quelques minutes.";
    return Response.json({ erreur: message }, { status: 502 });
  }
}
