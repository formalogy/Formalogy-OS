"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { joursDeSession } from "@/lib/emargement";
import { sessionPourEmargement } from "@/lib/emargement-acces";
import { journaliser } from "@/lib/journal";
import { prisma } from "@/lib/prisma";
import { exigerUtilisateur } from "@/lib/session";
import { aujourdhuiUTC, jourDepuisSaisie } from "@/lib/sessions-libelles";

export type ResultatSaisie = { erreur?: string };

const schema = z.object({
  sessionId: z.string().min(1),
  jour: z.string(),
  creneau: z.enum(["MATIN", "APRES_MIDI"]),
});

/// Vérifications communes : accès à la session, demi-journée appartenant à la
/// session et déjà commencée (on ne déclare pas une présence à l'avance).
async function preparer(donnees: FormData) {
  const utilisateur = await exigerUtilisateur();
  const r = schema.safeParse({
    sessionId: donnees.get("sessionId"),
    jour: donnees.get("jour"),
    creneau: donnees.get("creneau"),
  });
  if (!r.success) return { erreur: "Saisie invalide." } as const;

  const session = await sessionPourEmargement(utilisateur, r.data.sessionId);
  if (!session) return { erreur: "Session introuvable." } as const;

  const jour = jourDepuisSaisie(r.data.jour);
  if (!jour || !joursDeSession(session.dateDebut, session.dateFin).some((j) => j.getTime() === jour.getTime())) {
    return { erreur: "Ce jour ne fait pas partie de la session." } as const;
  }
  if (jour > aujourdhuiUTC()) {
    return { erreur: "On ne peut pas saisir une présence pour un jour à venir." } as const;
  }
  return { utilisateur, session, jour, creneau: r.data.creneau } as const;
}

function rafraichir(sessionId: string) {
  revalidatePath(`/sessions/${sessionId}`, "layout");
  revalidatePath(`/mes-sessions/${sessionId}`, "layout");
  revalidatePath("/emargements");
}

export async function enregistrerPresence(donnees: FormData): Promise<ResultatSaisie> {
  const c = await preparer(donnees);
  if ("erreur" in c) return { erreur: c.erreur };

  const learnerId = String(donnees.get("learnerId") ?? "");
  if (!c.session.inscriptions.some((i) => i.learner.id === learnerId)) {
    return { erreur: "Cet apprenant n'est pas inscrit à la session." };
  }
  const statut = z.enum(["PRESENT", "ABSENT", "ABSENT_JUSTIFIE", ""]).safeParse(donnees.get("statut"));
  if (!statut.success) return { erreur: "Statut invalide." };

  const cle = { sessionId: c.session.id, learnerId, jour: c.jour, creneau: c.creneau };
  if (statut.data === "") {
    await prisma.presence.deleteMany({ where: cle });
  } else {
    await prisma.presence.upsert({
      where: { sessionId_learnerId_jour_creneau: cle },
      create: { ...cle, statut: statut.data, saisieParId: c.utilisateur.id },
      update: { statut: statut.data, saisieParId: c.utilisateur.id },
    });
  }

  rafraichir(c.session.id);
  return {};
}

/// Marque présents, sur une demi-journée, tous les inscrits pas encore saisis.
/// Ne modifie jamais une absence déjà enregistrée.
export async function marquerTousPresents(donnees: FormData): Promise<ResultatSaisie> {
  const c = await preparer(donnees);
  if ("erreur" in c) return { erreur: c.erreur };

  const r = await prisma.presence.createMany({
    data: c.session.inscriptions.map((i) => ({
      sessionId: c.session.id,
      learnerId: i.learner.id,
      jour: c.jour,
      creneau: c.creneau,
      statut: "PRESENT" as const,
      saisieParId: c.utilisateur.id,
    })),
    skipDuplicates: true,
  });

  if (r.count > 0) {
    await journaliser({
      action: "attendance.bulk_present",
      summary: `Émargement ${c.session.numero} : ${r.count} présence(s) enregistrée(s) le ${c.jour.toISOString().slice(0, 10)} (${c.creneau === "MATIN" ? "matin" : "après-midi"})`,
      entityType: "TrainingSession",
      entityId: c.session.id,
      userId: c.utilisateur.id,
    });
  }

  rafraichir(c.session.id);
  return {};
}
