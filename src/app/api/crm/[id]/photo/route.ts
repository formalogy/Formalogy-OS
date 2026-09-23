import { recupererGravatar } from "@/lib/gravatar";
import { prisma } from "@/lib/prisma";
import { lireUtilisateur } from "@/lib/session";

/// Avatar d'un prospect : Gravatar associé à son email, sinon 404 (le client
/// affiche alors les initiales). Pas de dépôt manuel pour les prospects, à la
/// différence des apprenants : réservée à l'équipe commerciale.
export async function GET(_request: Request, ctx: RouteContext<"/api/crm/[id]/photo">) {
  const utilisateur = await lireUtilisateur();
  if (!utilisateur) return new Response("Connexion requise.", { status: 401 });
  if (utilisateur.role !== "ADMIN" && utilisateur.role !== "GESTIONNAIRE") {
    return new Response("Accès refusé.", { status: 403 });
  }

  const { id } = await ctx.params;
  const prospect = await prisma.prospect.findFirst({
    where: { id, deletedAt: null },
    select: { email: true },
  });
  if (!prospect?.email) return new Response("Photo introuvable.", { status: 404 });

  const gravatar = await recupererGravatar(prospect.email);
  if (!gravatar) return new Response("Photo introuvable.", { status: 404 });

  return new Response(Buffer.from(gravatar.octets), {
    headers: { "Content-Type": gravatar.typeMime, "Cache-Control": "private, max-age=3600" },
  });
}
