import type { Prisma } from "@prisma/client";

import { docxVersPdf } from "@/lib/docx-vers-pdf";
import { FORMATS_ACCEPTES, TYPE_MIME_DOCX } from "@/lib/documents-libelles";
import { documentsVisiblesPourFormateur, formateurDuCompte } from "@/lib/formateurs";
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
  const { id } = await ctx.params;

  // Administrateurs et gestionnaires voient tous les documents. Un formateur
  // ne voit que les documents autorisés de ses propres sessions : la règle est
  // intégrée à la requête elle-même.
  let filtreDocument: Prisma.DocumentWhereInput = { deletedAt: null };
  if (utilisateur.role === "FORMATEUR") {
    const formateur = await formateurDuCompte(utilisateur.id);
    if (!formateur) return new Response("Document introuvable.", { status: 404 });
    filtreDocument = documentsVisiblesPourFormateur(formateur.id);
  } else if (utilisateur.role !== "ADMIN" && utilisateur.role !== "GESTIONNAIRE") {
    return new Response("Accès refusé.", { status: 403 });
  }

  const version = await prisma.documentVersion.findFirst({
    where: { id, document: filtreDocument },
  });
  // Même réponse pour « inexistant », « supprimé » et « non autorisé » : ne rien révéler.
  if (!version) return new Response("Document introuvable.", { status: 404 });

  let fichier: Blob;
  try {
    fichier = await stockage().lire(version.cheminStockage);
  } catch (erreur) {
    console.error("Lecture du fichier impossible :", erreur);
    return new Response("Le fichier est momentanément indisponible.", { status: 503 });
  }

  // Un document Word ne s'affiche pas dans un navigateur. Plutôt que de
  // l'envoyer chez un service de conversion, on le rend en PDF avec le moteur
  // qui sert déjà aux conventions : le fichier d'origine n'est pas modifié,
  // c'est une vue jetable, recalculée à chaque demande.
  const parametres = new URL(request.url).searchParams;
  if (parametres.has("apercu") && version.typeMime === TYPE_MIME_DOCX) {
    try {
      const pdf = await docxVersPdf(new Uint8Array(await fichier.arrayBuffer()), version.nomFichier);
      return new Response(Buffer.from(pdf), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": "inline",
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "private, no-store",
        },
      });
    } catch (erreur) {
      console.error("Aperçu du document Word impossible :", erreur);
      return new Response("Aperçu impossible pour ce document.", { status: 422 });
    }
  }

  // Aperçu dans le navigateur uniquement pour les formats sûrs (PDF, images) ;
  // tout le reste est proposé au téléchargement.
  const telechargement = parametres.has("telecharger");
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
