import { sessionPourEmargement } from "@/lib/emargement-acces";
import { genererQrCodesEmargement } from "@/lib/emargement-numerique";
import { lireUtilisateur } from "@/lib/session";

/// QR codes d'émargement des apprenants d'une session, à imprimer ou à
/// afficher en salle. Équipe : toutes les sessions ; formateur : les siennes.
export async function GET(_request: Request, ctx: RouteContext<"/api/sessions/[id]/qr-emargement">) {
  const utilisateur = await lireUtilisateur();
  if (!utilisateur) return new Response("Connexion requise.", { status: 401 });

  const { id } = await ctx.params;
  const session = await sessionPourEmargement(utilisateur, id);
  if (!session) return new Response("Session introuvable.", { status: 404 });

  const pdf = await genererQrCodesEmargement(session.id);
  if (!pdf) return new Response("Aucun apprenant inscrit à cette session.", { status: 404 });

  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="QR-emargement-${session.numero}.pdf"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
