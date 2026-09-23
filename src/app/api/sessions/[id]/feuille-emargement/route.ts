import { sessionPourEmargement } from "@/lib/emargement-acces";
import { genererFeuillesEmargement } from "@/lib/emargement-pdf";
import { aujourdhuiUTC } from "@/lib/sessions-libelles";
import { lireOrganisme } from "@/lib/organisme";
import { lireUtilisateur } from "@/lib/session";

/// Feuilles d'émargement pré-remplies d'une session, générées à la demande.
/// Équipe : toutes les sessions ; formateur : les siennes uniquement.
export async function GET(_request: Request, ctx: RouteContext<"/api/sessions/[id]/feuille-emargement">) {
  const utilisateur = await lireUtilisateur();
  if (!utilisateur) return new Response("Connexion requise.", { status: 401 });

  const { id } = await ctx.params;
  const session = await sessionPourEmargement(utilisateur, id);
  if (!session) return new Response("Session introuvable.", { status: 404 });

  const pdf = await genererFeuillesEmargement(session, (await lireOrganisme()).raisonSociale, aujourdhuiUTC());
  const nom = `Emargement-${session.numero}.pdf`;

  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nom}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
