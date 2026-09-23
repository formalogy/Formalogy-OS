import { recupererGravatar } from "@/lib/gravatar";
import { prisma } from "@/lib/prisma";
import { lireUtilisateur } from "@/lib/session";
import { stockage } from "@/lib/stockage";

/// Photo de profil d'un apprenant : réservée à l'équipe, mêmes rôles que sa
/// fiche (jamais aux formateurs). Priorité à une photo déposée à la main ;
/// à défaut, avatar Gravatar associé à son email ; sinon 404 (le client
/// affiche alors les initiales).
export async function GET(_request: Request, ctx: RouteContext<"/api/apprenants/[id]/photo">) {
  const utilisateur = await lireUtilisateur();
  if (!utilisateur) return new Response("Connexion requise.", { status: 401 });
  if (utilisateur.role !== "ADMIN" && utilisateur.role !== "GESTIONNAIRE") {
    return new Response("Accès refusé.", { status: 403 });
  }

  const { id } = await ctx.params;
  const apprenant = await prisma.learner.findFirst({
    where: { id, deletedAt: null },
    select: { photoCheminStockage: true, email: true },
  });
  if (!apprenant) return new Response("Apprenant introuvable.", { status: 404 });

  if (apprenant.photoCheminStockage) {
    try {
      const blob = await stockage().lire(apprenant.photoCheminStockage);
      return new Response(blob, {
        headers: { "Content-Type": blob.type || "image/jpeg", "Cache-Control": "private, max-age=300" },
      });
    } catch {
      // Le pointeur existe mais le fichier a disparu du stockage : on retente
      // via Gravatar plutôt que d'échouer directement.
    }
  }

  if (apprenant.email) {
    const gravatar = await recupererGravatar(apprenant.email);
    if (gravatar) {
      return new Response(Buffer.from(gravatar.octets), {
        headers: { "Content-Type": gravatar.typeMime, "Cache-Control": "private, max-age=3600" },
      });
    }
  }

  return new Response("Photo introuvable.", { status: 404 });
}
