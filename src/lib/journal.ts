import { prisma } from "@/lib/prisma";

type EntreeJournal = {
  action: string;
  summary: string;
  entityType?: string;
  entityId?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
};

/// Enregistre une ligne dans le journal d'activité.
///
/// Un échec d'écriture ne doit jamais faire échouer l'action métier
/// elle-même : mieux vaut une facture créée sans sa trace qu'une facture
/// perdue. L'erreur est signalée dans les journaux du serveur.
export async function journaliser(entree: EntreeJournal): Promise<void> {
  try {
    await prisma.activity.create({
      data: {
        action: entree.action,
        summary: entree.summary,
        entityType: entree.entityType,
        entityId: entree.entityId,
        userId: entree.userId,
        metadata: entree.metadata as never,
      },
    });
  } catch (erreur) {
    console.error("Écriture impossible dans le journal d'activité :", erreur);
  }
}
