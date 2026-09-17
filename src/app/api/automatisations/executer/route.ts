import { timingSafeEqual } from "node:crypto";

import { executerPlanifiees } from "@/lib/automatisations/moteur";
import { releverBoite } from "@/lib/signatures/boite-mail";

/// Réveil des tâches de fond : automatisations planifiées (rappels avant
/// session, relances) et relève des documents signés dans la boîte Gmail.
///
/// Appelé régulièrement (au moins une fois par jour) par un planificateur externe (configuré à la mise
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

  const [automatisations, signatures] = await Promise.all([executerPlanifiees(), releverBoite()]);
  return Response.json({ automatisations, signatures });
}
