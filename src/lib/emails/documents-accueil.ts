import "server-only";

import type { PieceJointe } from "@/lib/emails/envoi";
import { prisma } from "@/lib/prisma";
import { stockage } from "@/lib/stockage";

/// Emails de bienvenue qui partent avec les documents d'accueil (client,
/// 01/10/2026) : livret d'accueil, règlement intérieur et programme choisi
/// sur la session (un des programmes de son formateur).
export const MODELES_AVEC_DOCUMENTS_ACCUEIL = ["NOUVEL_ENTRANT_PRESENTIEL", "NOUVEL_ENTRANT_ELEARNING", "NOUVEL_ENTRANT_MIXTE"];

/// Dernière version d'un document de la Bibliothèque (livret, règlement), ou
/// du programme choisi sur la session — jamais un autre programme.
async function dernierDocument(typeCode: string, programmeId?: string | null) {
  if (typeCode === "PROGRAMME" && !programmeId) return null;
  const document = await prisma.document.findFirst({
    where: {
      deletedAt: null,
      type: { code: typeCode },
      ...(typeCode === "PROGRAMME" ? { id: programmeId as string } : { sessionId: null, learnerId: null, trainerId: null }),
    },
    orderBy: { updatedAt: "desc" },
    include: { versions: { orderBy: { numero: "desc" }, take: 1 } },
  });
  return document?.versions[0] ?? null;
}

/// Documents d'accueil à joindre ; un document absent est simplement omis,
/// la liste des manquants permet de le signaler.
export async function documentsAccueil(programmeId?: string | null): Promise<{ pieces: PieceJointe[]; manquants: string[] }> {
  const attendus = [
    ["LIVRET_ACCUEIL", "livret d'accueil"],
    ["REGLEMENT_INTERIEUR", "règlement intérieur"],
    ["PROGRAMME", "programme de la session"],
  ] as const;
  const pieces: PieceJointe[] = [];
  const manquants: string[] = [];
  for (const [code, libelle] of attendus) {
    const version = await dernierDocument(code, programmeId);
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
export async function documentsAccueilManquants(programmeId?: string | null): Promise<string[]> {
  const manquants: string[] = [];
  if (!(await dernierDocument("LIVRET_ACCUEIL"))) manquants.push("livret d'accueil");
  if (!(await dernierDocument("REGLEMENT_INTERIEUR"))) manquants.push("règlement intérieur");
  if (!(await dernierDocument("PROGRAMME", programmeId))) manquants.push("programme de la session");
  return manquants;
}
