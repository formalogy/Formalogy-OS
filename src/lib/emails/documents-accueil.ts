import "server-only";

import type { PieceJointe } from "@/lib/emails/envoi";
import { prisma } from "@/lib/prisma";
import { stockage } from "@/lib/stockage";

/// Emails de bienvenue qui partent avec les documents d'accueil (client,
/// 01/10/2026) : livret d'accueil, règlement intérieur et programme de la
/// formation.
export const MODELES_AVEC_DOCUMENTS_ACCUEIL = ["NOUVEL_ENTRANT_PRESENTIEL", "NOUVEL_ENTRANT_ELEARNING", "NOUVEL_ENTRANT_MIXTE"];

/// Dernière version d'un document de la Bibliothèque. Le programme est celui
/// de la formation : jamais celui d'une autre formation.
async function dernierDocument(typeCode: string, formationId?: string) {
  if (typeCode === "PROGRAMME" && !formationId) return null;
  const document = await prisma.document.findFirst({
    where: {
      deletedAt: null,
      type: { code: typeCode },
      sessionId: null,
      learnerId: null,
      ...(typeCode === "PROGRAMME" ? { formationId } : {}),
    },
    orderBy: { updatedAt: "desc" },
    include: { versions: { orderBy: { numero: "desc" }, take: 1 } },
  });
  return document?.versions[0] ?? null;
}

/// Documents d'accueil à joindre ; un document absent est simplement omis,
/// la liste des manquants permet de le signaler.
export async function documentsAccueil(formationId?: string): Promise<{ pieces: PieceJointe[]; manquants: string[] }> {
  const attendus = [
    ["LIVRET_ACCUEIL", "livret d'accueil"],
    ["REGLEMENT_INTERIEUR", "règlement intérieur"],
    ["PROGRAMME", "programme de la formation"],
  ] as const;
  const pieces: PieceJointe[] = [];
  const manquants: string[] = [];
  for (const [code, libelle] of attendus) {
    const version = await dernierDocument(code, formationId);
    if (!version) {
      manquants.push(libelle);
      continue;
    }
    try {
      const blob = await stockage().lire(version.cheminStockage);
      pieces.push({ nom: version.nomFichier, contenu: new Uint8Array(await blob.arrayBuffer()), typeMime: version.typeMime });
    } catch {
      manquants.push(libelle);
    }
  }
  return { pieces, manquants };
}

/// Ce qui manquerait, sans lire les fichiers (affichage avant l'envoi).
export async function documentsAccueilManquants(formationId?: string): Promise<string[]> {
  const manquants: string[] = [];
  if (!(await dernierDocument("LIVRET_ACCUEIL"))) manquants.push("livret d'accueil");
  if (!(await dernierDocument("REGLEMENT_INTERIEUR"))) manquants.push("règlement intérieur");
  if (!(await dernierDocument("PROGRAMME", formationId))) manquants.push("programme de la formation");
  return manquants;
}
