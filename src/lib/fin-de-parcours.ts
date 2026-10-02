import "server-only";

import { construireContexte } from "@/lib/emails/contexte";
import { envoyerEmail, type PieceJointe } from "@/lib/emails/envoi";
import { rendre } from "@/lib/emails/modeles";
import { prisma } from "@/lib/prisma";
import { stockage } from "@/lib/stockage";

/// Envoie à un stagiaire son attestation et son certificat de réalisation
/// (modèle DOCUMENTS_FIN), dès la fin de son parcours en ligne, sans attendre
/// la fin de la session. L'automatisation « Documents de fin de formation »
/// ne le servira pas une seconde fois : elle écarte qui a déjà reçu ce modèle
/// pour la session. Renvoie un message d'erreur, ou null.
export async function envoyerDocumentsFinStagiaire(sessionId: string, learnerId: string, userId: string): Promise<string | null> {
  const [modele, apprenant] = await Promise.all([
    prisma.emailTemplate.findUnique({ where: { code: "DOCUMENTS_FIN" } }),
    prisma.learner.findFirst({ where: { id: learnerId, deletedAt: null }, select: { email: true, companyId: true } }),
  ]);
  if (!modele?.actif) return "le modèle d'email « DOCUMENTS_FIN » est désactivé";
  if (!apprenant?.email) return "le stagiaire n'a pas d'adresse email";
  const deja = await prisma.email.count({ where: { templateId: modele.id, sessionId, learnerId, statut: { not: "ECHEC" } } });
  if (deja > 0) return null;

  const documents = await prisma.document.findMany({
    where: { deletedAt: null, sessionId, learnerId, type: { code: { in: ["ATTESTATION", "CERTIFICAT"] } } },
    include: { versions: { orderBy: { numero: "desc" }, take: 1 } },
  });
  if (documents.length < 2) return "attestation ou certificat pas encore générés";
  const piecesJointes: PieceJointe[] = [];
  for (const d of documents) {
    const v = d.versions[0];
    if (!v) return "document sans fichier";
    const blob = await stockage().lire(v.cheminStockage);
    piecesJointes.push({ nom: v.nomFichier, contenu: new Uint8Array(await blob.arrayBuffer()), typeMime: v.typeMime });
  }

  const contexte = await construireContexte({ learnerId, sessionId, companyId: apprenant.companyId ?? undefined });
  const email = await envoyerEmail({
    destinataire: apprenant.email,
    sujet: rendre(modele.sujet, contexte).resultat,
    corps: rendre(modele.corps, contexte).resultat,
    templateId: modele.id,
    learnerId,
    sessionId,
    companyId: apprenant.companyId ?? undefined,
    createdById: userId,
    piecesJointes,
  });
  return email.statut === "ECHEC" ? `l'email n'est pas parti (${email.erreur})` : null;
}
