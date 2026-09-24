import { CHAMPS_IMAGE, type ImageOrganisme } from "@/lib/organisme-signature";
import { prisma } from "@/lib/prisma";
import { lireUtilisateur } from "@/lib/session";
import { stockage } from "@/lib/stockage";

/// Logo ou signature de l'organisme. Réservés à l'équipe : ce sont les images
/// qui engagent la société.
export async function GET(request: Request) {
  const utilisateur = await lireUtilisateur();
  if (!utilisateur) return new Response("Connexion requise.", { status: 401 });
  if (utilisateur.role !== "ADMIN" && utilisateur.role !== "GESTIONNAIRE") {
    return new Response("Accès refusé.", { status: 403 });
  }

  const demande = new URL(request.url).searchParams.get("nom");
  const quoi: ImageOrganisme = demande === "logo" ? "logo" : "signature";

  const organisme = await prisma.organisme.findFirst({
    select: { signatureCheminStockage: true, logoCheminStockage: true },
  });
  const chemin = organisme?.[CHAMPS_IMAGE[quoi]];
  if (!chemin) return new Response("Aucune image.", { status: 404 });

  try {
    const blob = await stockage().lire(chemin);
    return new Response(blob, {
      headers: { "Content-Type": blob.type || "image/png", "Cache-Control": "private, no-store" },
    });
  } catch {
    return new Response("Image introuvable.", { status: 404 });
  }
}
