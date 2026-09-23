import { prisma } from "@/lib/prisma";
import { lireUtilisateur } from "@/lib/session";
import { stockage } from "@/lib/stockage";

/// Signature de l'organisme. Réservée à l'équipe : elle n'a rien à faire
/// entre les mains d'un tiers, c'est l'image qui engage la société.
export async function GET() {
  const utilisateur = await lireUtilisateur();
  if (!utilisateur) return new Response("Connexion requise.", { status: 401 });
  if (utilisateur.role !== "ADMIN" && utilisateur.role !== "GESTIONNAIRE") {
    return new Response("Accès refusé.", { status: 403 });
  }

  const organisme = await prisma.organisme.findFirst({ select: { signatureCheminStockage: true } });
  if (!organisme?.signatureCheminStockage) return new Response("Aucune signature.", { status: 404 });

  try {
    const blob = await stockage().lire(organisme.signatureCheminStockage);
    return new Response(blob, {
      headers: { "Content-Type": blob.type || "image/png", "Cache-Control": "private, no-store" },
    });
  } catch {
    return new Response("Signature introuvable.", { status: 404 });
  }
}
