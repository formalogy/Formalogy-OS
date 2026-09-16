import { timingSafeEqual } from "node:crypto";

import { executerPlanifiees } from "@/lib/automatisations/moteur";

/// Réveil des automatisations planifiées (rappels avant session, relances).
///
/// Appelé une fois par jour par un planificateur externe (configuré à la mise
/// en ligne, Phase 18). Protégé par un secret partagé : sans lui, n'importe qui
/// pourrait déclencher des envois. Relancer plusieurs fois est sans danger,
/// les cas déjà traités sont reconnus.
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response("Réveil non configuré.", { status: 503 });

  const fourni = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const a = Buffer.from(fourni);
  const b = Buffer.from(secret);
  // Comparaison à temps constant : la durée de la vérification ne doit rien
  // révéler du secret.
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return new Response("Accès refusé.", { status: 401 });
  }

  const bilan = await executerPlanifiees();
  return Response.json(bilan);
}
