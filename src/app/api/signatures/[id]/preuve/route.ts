import { prisma } from "@/lib/prisma";
import { lireUtilisateur } from "@/lib/session";
import { stockage } from "@/lib/stockage";

/// Téléchargement de la preuve de signature (journal d'audit BoldSign).
/// Réservé à l'équipe : la preuve contient les adresses et traces de connexion
/// des signataires.
export async function GET(_request: Request, ctx: RouteContext<"/api/signatures/[id]/preuve">) {
  const utilisateur = await lireUtilisateur();
  if (!utilisateur) return new Response("Connexion requise.", { status: 401 });
  if (utilisateur.role !== "ADMIN" && utilisateur.role !== "GESTIONNAIRE") {
    return new Response("Accès refusé.", { status: 403 });
  }

  const { id } = await ctx.params;
  const demande = await prisma.signatureRequest.findFirst({
    where: { id, preuveChemin: { not: null }, document: { deletedAt: null } },
  });
  if (!demande?.preuveChemin) return new Response("Preuve introuvable.", { status: 404 });

  let fichier: Blob;
  try {
    fichier = await stockage().lire(demande.preuveChemin);
  } catch (erreur) {
    console.error("Lecture de la preuve impossible :", erreur);
    return new Response("Le fichier est momentanément indisponible.", { status: 503 });
  }

  const nom = demande.preuveNomFichier ?? `preuve-${demande.reference}.pdf`;
  const nomAscii = nom.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
  return new Response(fichier, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nomAscii}"; filename*=UTF-8''${encodeURIComponent(nom)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
