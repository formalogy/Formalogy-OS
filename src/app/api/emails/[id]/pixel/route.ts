import { prisma } from "@/lib/prisma";

/// GIF transparent 1x1 : le plus petit format lisible par tous les clients de
/// messagerie, servi en dur pour ne dépendre d'aucun fichier statique.
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64");

const REPONSE = {
  "Content-Type": "image/gif",
  "Content-Length": String(PIXEL.length),
  "Cache-Control": "no-store",
};

/// Pixel de suivi d'ouverture, intégré à chaque email réellement envoyé (voir
/// lib/emails/envoi.ts). Route volontairement sans authentification : elle est
/// appelée par le client de messagerie du destinataire, jamais par un
/// utilisateur connecté. Un identifiant d'email inconnu ou déjà marqué ouvert
/// ne déclenche aucune erreur, seulement un pixel renvoyé sans effet.
export async function GET(_request: Request, ctx: RouteContext<"/api/emails/[id]/pixel">) {
  const { id } = await ctx.params;

  await prisma.email.updateMany({
    where: { id, statut: "ENVOYE", ouvertAt: null },
    data: { statut: "OUVERT", ouvertAt: new Date() },
  });

  return new Response(PIXEL, { headers: REPONSE });
}
