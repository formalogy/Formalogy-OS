import { exporterDonneesApprenant } from "@/lib/rgpd";
import { lireUtilisateur } from "@/lib/session";

/// Export RGPD (droit d'accès / portabilité) d'un apprenant, au format JSON.
export async function GET(_request: Request, ctx: RouteContext<"/api/apprenants/[id]/export-rgpd">) {
  const utilisateur = await lireUtilisateur();
  if (!utilisateur) return new Response("Connexion requise.", { status: 401 });
  if (utilisateur.role !== "ADMIN" && utilisateur.role !== "GESTIONNAIRE") {
    return new Response("Accès refusé.", { status: 403 });
  }

  const { id } = await ctx.params;
  const donnees = await exporterDonneesApprenant(id);
  if (!donnees) return new Response("Apprenant introuvable.", { status: 404 });

  return new Response(JSON.stringify(donnees, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="export-rgpd-${id.slice(0, 8)}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}
