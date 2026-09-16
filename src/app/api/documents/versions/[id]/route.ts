import { FORMATS_ACCEPTES } from "@/lib/documents-libelles";
import { prisma } from "@/lib/prisma";
import { lireUtilisateur } from "@/lib/session";
import { stockage } from "@/lib/stockage";

/// Seule porte d'accès aux fichiers déposés.
///
/// L'espace de stockage est privé : aucun fichier n'a d'adresse publique. Le
/// serveur vérifie la session et le rôle, puis transmet le fichier lui-même.
/// Un lien copié et envoyé à quelqu'un de non connecté ne donne donc accès à rien.
export async function GET(request: Request, ctx: RouteContext<"/api/documents/versions/[id]">) {
  const utilisateur = await lireUtilisateur();
  if (!utilisateur) return new Response("Connexion requise.", { status: 401 });
  // Les formateurs auront accès à certains documents en Phase 10, avec leurs
  // propres règles. D'ici là, seuls administrateurs et gestionnaires.
  if (utilisateur.role !== "ADMIN" && utilisateur.role !== "GESTIONNAIRE") {
    return new Response("Accès refusé.", { status: 403 });
  }

  const { id } = await ctx.params;
  const version = await prisma.documentVersion.findFirst({
    where: { id, document: { deletedAt: null } },
  });
  // Même réponse pour « inexistant » et « supprimé » : ne rien révéler.
  if (!version) return new Response("Document introuvable.", { status: 404 });

  let fichier: Blob;
  try {
    fichier = await stockage().lire(version.cheminStockage);
  } catch (erreur) {
    console.error("Lecture du fichier impossible :", erreur);
    return new Response("Le fichier est momentanément indisponible.", { status: 503 });
  }

  // Aperçu dans le navigateur uniquement pour les formats sûrs (PDF, images) ;
  // tout le reste est proposé au téléchargement.
  const telechargement = new URL(request.url).searchParams.has("telecharger");
  const apercuPossible = FORMATS_ACCEPTES[version.typeMime]?.apercu ?? false;
  const disposition = telechargement || !apercuPossible ? "attachment" : "inline";

  // Nom de fichier encodé selon la RFC 6266, pour les accents et espaces.
  const nomAscii = version.nomFichier.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
  const nomEncode = encodeURIComponent(version.nomFichier);

  return new Response(fichier, {
    headers: {
      "Content-Type": version.typeMime,
      "Content-Length": String(version.taille),
      "Content-Disposition": `${disposition}; filename="${nomAscii}"; filename*=UTF-8''${nomEncode}`,
      // Le navigateur doit respecter le type annoncé, jamais le deviner.
      "X-Content-Type-Options": "nosniff",
      // Documents contenant des données personnelles : aucune mise en cache
      // partagée.
      "Cache-Control": "private, no-store",
    },
  });
}
