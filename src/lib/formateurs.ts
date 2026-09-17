import "server-only";

import type { StatutFormateur } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export const STATUTS_FORMATEUR: StatutFormateur[] = ["INDEPENDANT", "SALARIE", "SOUS_TRAITANT"];

export const LIBELLE_STATUT_FORMATEUR: Record<StatutFormateur, string> = {
  INDEPENDANT: "Indépendant",
  SALARIE: "Salarié",
  SOUS_TRAITANT: "Sous-traitant",
};

export function nomFormateur(f: { prenom: string; nom: string } | null | undefined): string | null {
  return f ? `${f.prenom} ${f.nom}` : null;
}

/// Formateurs proposables dans un formulaire de session : les actifs, plus le
/// formateur déjà affecté même s'il a été désactivé depuis.
export async function optionsFormateurs(actuelId?: string | null) {
  const formateurs = await prisma.trainer.findMany({
    where: {
      deletedAt: null,
      OR: [{ actif: true }, ...(actuelId ? [{ id: actuelId }] : [])],
    },
    orderBy: [{ nom: "asc" }, { prenom: "asc" }],
    select: { id: true, prenom: true, nom: true, specialites: true },
  });
  return formateurs.map((f) => ({
    id: f.id,
    libelle: `${f.nom} ${f.prenom}${f.specialites ? ` — ${f.specialites}` : ""}`,
  }));
}

/// Fiche formateur liée au compte connecté, pour l'espace « Mes sessions ».
export async function formateurDuCompte(userId: string) {
  return prisma.trainer.findFirst({ where: { userId, deletedAt: null } });
}

/// Types de documents qu'un formateur peut consulter pour ses sessions.
/// Liste fermée : conventions, devis, factures ou accords de financement
/// contiennent des prix et restent réservés à l'équipe.
export const TYPES_VISIBLES_FORMATEUR = ["PROGRAMME", "CONVOCATION", "EMARGEMENT"];

/// Filtre Prisma des documents visibles par un formateur : documents non
/// supprimés, d'un type autorisé, rattachés à l'une de ses sessions ou à une
/// formation qu'il anime.
export function documentsVisiblesPourFormateur(trainerId: string) {
  const sessionsDuFormateur = { trainerId, deletedAt: null };
  return {
    deletedAt: null,
    type: { code: { in: TYPES_VISIBLES_FORMATEUR } },
    OR: [
      { session: sessionsDuFormateur },
      { formation: { sessions: { some: sessionsDuFormateur } } },
    ],
  };
}
