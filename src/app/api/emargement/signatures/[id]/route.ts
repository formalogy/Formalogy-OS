import { sessionPourEmargement } from "@/lib/emargement-acces";
import { prisma } from "@/lib/prisma";
import { lireUtilisateur } from "@/lib/session";

/// Image d'une signature d'émargement, pour l'écran d'émargement de la
/// session. Équipe : toutes les sessions ; formateur : les siennes uniquement.
export async function GET(_request: Request, ctx: RouteContext<"/api/emargement/signatures/[id]">) {
  const utilisateur = await lireUtilisateur();
  if (!utilisateur) return new Response("Connexion requise.", { status: 401 });

  const { id } = await ctx.params;
  const signature = await prisma.signatureEmargement.findUnique({ where: { id }, select: { sessionId: true, image: true } });
  // Même réponse pour une signature inexistante et pour une session d'un autre formateur.
  if (!signature || !(await sessionPourEmargement(utilisateur, signature.sessionId))) {
    return new Response("Signature introuvable.", { status: 404 });
  }

  return new Response(Buffer.from(signature.image), {
    headers: {
      "Content-Type": "image/png",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
