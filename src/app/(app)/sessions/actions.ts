"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { z } from "zod";

import { declencher } from "@/lib/automatisations/moteur";
import { journaliser } from "@/lib/journal";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";
import {
  formaterPeriode,
  jourDepuisSaisie,
  LIBELLE_STATUT_SESSION,
  STATUTS_SESSION,
} from "@/lib/sessions-libelles";

export type EtatFormulaire = {
  erreur?: string;
  valeurs?: Record<string, string>;
};

function saisie(donnees: FormData): Record<string, string> {
  const valeurs: Record<string, string> = {};
  for (const [cle, valeur] of donnees.entries()) {
    if (typeof valeur === "string") valeurs[cle] = valeur;
  }
  return valeurs;
}

const texteFacultatif = z
  .string()
  .trim()
  .transform((valeur) => (valeur === "" ? undefined : valeur))
  .optional();

const schemaSession = z
  .object({
    formationId: z.string().min(1, "Choisissez une formation."),
    companyId: texteFacultatif,
    dateDebut: z.string().transform((v, ctx) => {
      const d = jourDepuisSaisie(v);
      if (!d) ctx.addIssue({ code: "custom", message: "La date de début est obligatoire." });
      return d as Date;
    }),
    dateFin: z.string().transform((v, ctx) => {
      const d = jourDepuisSaisie(v);
      if (!d) ctx.addIssue({ code: "custom", message: "La date de fin est obligatoire." });
      return d as Date;
    }),
    horaires: texteFacultatif,
    lieu: texteFacultatif,
    modalite: z.enum(["PRESENTIEL", "DISTANCIEL", "E_LEARNING", "HYBRIDE"]),
    statut: z.enum(STATUTS_SESSION as [string, ...string[]]),
    intervenant: texteFacultatif,
    placesMax: texteFacultatif.refine(
      (v) => v === undefined || (/^\d+$/.test(v) && Number(v) > 0),
      "Le nombre de places doit être un entier positif.",
    ),
    notes: texteFacultatif,
  })
  .refine((d) => !d.dateDebut || !d.dateFin || d.dateFin >= d.dateDebut, {
    message: "La date de fin ne peut pas précéder la date de début.",
  });

/// Numéro lisible et unique : S-2026-0001, S-2026-0002…
/// En cas de création simultanée, la contrainte d'unicité en base tranche et
/// on retente avec le numéro suivant.
async function creerAvecNumero(
  annee: number,
  creer: (numero: string) => Promise<{ id: string; numero: string }>,
) {
  const prefixe = `S-${annee}-`;
  for (let tentative = 0; tentative < 5; tentative++) {
    const derniere = await prisma.trainingSession.findFirst({
      where: { numero: { startsWith: prefixe } },
      orderBy: { numero: "desc" },
      select: { numero: true },
    });
    const suivant = derniere ? Number(derniere.numero.slice(prefixe.length)) + 1 : 1;
    try {
      return await creer(`${prefixe}${String(suivant).padStart(4, "0")}`);
    } catch (erreur) {
      const collision =
        erreur instanceof Prisma.PrismaClientKnownRequestError && erreur.code === "P2002";
      if (!collision) throw erreur;
    }
  }
  throw new Error("Impossible d'attribuer un numéro de session.");
}

export async function creerSession(
  _precedent: EtatFormulaire,
  donnees: FormData,
): Promise<EtatFormulaire> {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");

  const resultat = schemaSession.safeParse(Object.fromEntries(donnees));
  if (!resultat.success) {
    return { erreur: resultat.error.issues[0]?.message ?? "Saisie invalide.", valeurs: saisie(donnees) };
  }
  const d = resultat.data;

  // Une formation en brouillon ou archivée ne peut pas donner lieu à une
  // nouvelle session.
  const formation = await prisma.formation.findFirst({
    where: { id: d.formationId, deletedAt: null, statut: "ACTIVE" },
  });
  if (!formation) {
    return { erreur: "Cette formation n'est pas active dans le catalogue.", valeurs: saisie(donnees) };
  }

  const session = await creerAvecNumero(d.dateDebut.getUTCFullYear(), (numero) =>
    prisma.trainingSession.create({
      data: {
        numero,
        formationId: formation.id,
        companyId: d.companyId ?? null,
        dateDebut: d.dateDebut,
        dateFin: d.dateFin,
        horaires: d.horaires,
        lieu: d.lieu,
        modalite: d.modalite,
        statut: d.statut as never,
        intervenant: d.intervenant,
        placesMax: d.placesMax ? Number(d.placesMax) : null,
        prixHT: formation.prixHT,
        notes: d.notes,
        createdById: utilisateur.id,
      },
    }),
  );

  await journaliser({
    action: "session.created",
    summary: `Session ${session.numero} créée : ${formation.titre} — ${formaterPeriode(d.dateDebut, d.dateFin)}`,
    entityType: "TrainingSession",
    entityId: session.id,
    userId: utilisateur.id,
  });

  revalidatePath("/sessions");
  redirect(`/sessions/${session.id}`);
}

export async function modifierSession(
  _precedent: EtatFormulaire,
  donnees: FormData,
): Promise<EtatFormulaire> {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");

  const id = String(donnees.get("id") ?? "");
  const existante = await prisma.trainingSession.findFirst({ where: { id, deletedAt: null } });
  if (!existante) return { erreur: "Session introuvable.", valeurs: saisie(donnees) };

  const resultat = schemaSession.safeParse(Object.fromEntries(donnees));
  if (!resultat.success) {
    return { erreur: resultat.error.issues[0]?.message ?? "Saisie invalide.", valeurs: saisie(donnees) };
  }
  const d = resultat.data;

  // En modification, on accepte la formation actuelle même si elle a été
  // archivée entre-temps ; seul un changement vers une autre formation exige
  // qu'elle soit active.
  if (d.formationId !== existante.formationId) {
    const active = await prisma.formation.findFirst({
      where: { id: d.formationId, deletedAt: null, statut: "ACTIVE" },
    });
    if (!active) {
      return { erreur: "Cette formation n'est pas active dans le catalogue.", valeurs: saisie(donnees) };
    }
  }

  if (d.placesMax) {
    const inscrits = await prisma.sessionLearner.count({ where: { sessionId: id } });
    if (Number(d.placesMax) < inscrits) {
      return {
        erreur: `${inscrits} apprenants sont déjà inscrits : le nombre de places ne peut pas être inférieur.`,
        valeurs: saisie(donnees),
      };
    }
  }

  const session = await prisma.trainingSession.update({
    where: { id },
    data: {
      formationId: d.formationId,
      companyId: d.companyId ?? null,
      dateDebut: d.dateDebut,
      dateFin: d.dateFin,
      horaires: d.horaires ?? null,
      lieu: d.lieu ?? null,
      modalite: d.modalite,
      intervenant: d.intervenant ?? null,
      placesMax: d.placesMax ? Number(d.placesMax) : null,
      notes: d.notes ?? null,
    },
  });

  const datesChangees =
    existante.dateDebut.getTime() !== session.dateDebut.getTime() ||
    existante.dateFin.getTime() !== session.dateFin.getTime();

  await journaliser({
    action: "session.updated",
    summary: datesChangees
      ? `Session ${session.numero} déplacée : ${formaterPeriode(existante.dateDebut, existante.dateFin)} → ${formaterPeriode(session.dateDebut, session.dateFin)}`
      : `Session ${session.numero} modifiée`,
    entityType: "TrainingSession",
    entityId: session.id,
    userId: utilisateur.id,
  });

  // Le statut a son propre circuit, qui met aussi à jour les apprenants.
  if (d.statut !== existante.statut) {
    await appliquerStatut(id, d.statut as never, utilisateur.id);
  }

  revalidatePath("/sessions");
  revalidatePath("/planning");
  redirect(`/sessions/${id}`);
}

/// Change le statut d'une session et répercute l'avancement sur les apprenants :
/// une session qui démarre fait passer ses inscrits « en formation » ; une
/// session terminée les fait passer « terminé », sauf s'ils suivent encore une
/// autre session en cours.
async function appliquerStatut(
  sessionId: string,
  statut: (typeof STATUTS_SESSION)[number],
  userId: string,
) {
  const session = await prisma.trainingSession.update({
    where: { id: sessionId },
    data: { statut },
    include: { inscriptions: { select: { learnerId: true } } },
  });
  const ids = session.inscriptions.map((i) => i.learnerId);
  let apprenantsMisAJour = 0;

  if (statut === "EN_COURS" && ids.length) {
    const r = await prisma.learner.updateMany({
      where: { id: { in: ids }, statut: { in: ["PROSPECT", "INSCRIT"] } },
      data: { statut: "EN_FORMATION" },
    });
    apprenantsMisAJour = r.count;
  }

  if ((statut === "TERMINEE" || statut === "CLOTUREE") && ids.length) {
    // Un apprenant qui suit encore une autre session non achevée n'a pas
    // terminé son parcours : on ne le passe pas « terminé ».
    const autresSessionsEnCours = await prisma.sessionLearner.findMany({
      where: {
        learnerId: { in: ids },
        sessionId: { not: sessionId },
        session: { deletedAt: null, statut: { notIn: ["TERMINEE", "CLOTUREE", "ANNULEE"] } },
      },
      select: { learnerId: true },
    });
    const exclus = new Set(autresSessionsEnCours.map((i) => i.learnerId));
    // Une session peut passer directement de « Prête » à « Terminée » sans que
    // son statut ait été mis « En cours » : ses inscrits sont alors encore
    // « Inscrit », et doivent aussi passer « Terminé ».
    const r = await prisma.learner.updateMany({
      where: {
        id: { in: ids.filter((id) => !exclus.has(id)) },
        statut: { in: ["PROSPECT", "INSCRIT", "EN_FORMATION"] },
      },
      data: { statut: "TERMINE" },
    });
    apprenantsMisAJour = r.count;
  }

  if (statut === "TERMINEE" || statut === "CLOTUREE") {
    // Une session clôturée sans être passée par « terminée » déclenche aussi
    // ses suites ; une session passée par les deux ne les déclenche qu'une fois.
    after(() => declencher({ type: "SESSION_TERMINEE", sessionId }));
  }

  await journaliser({
    action: "session.status_changed",
    summary:
      `Session ${session.numero} — statut passé à « ${LIBELLE_STATUT_SESSION[statut]} »` +
      (apprenantsMisAJour
        ? ` (${apprenantsMisAJour} apprenant${apprenantsMisAJour > 1 ? "s" : ""} mis à jour)`
        : ""),
    entityType: "TrainingSession",
    entityId: session.id,
    userId,
  });
}

export async function changerStatutSession(donnees: FormData): Promise<void> {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");
  const r = z
    .object({ id: z.string().min(1), statut: z.enum(STATUTS_SESSION as [string, ...string[]]) })
    .safeParse(Object.fromEntries(donnees));
  if (!r.success) return;

  const existante = await prisma.trainingSession.findFirst({
    where: { id: r.data.id, deletedAt: null },
    select: { statut: true },
  });
  if (!existante || existante.statut === r.data.statut) return;

  await appliquerStatut(r.data.id, r.data.statut as never, utilisateur.id);
  revalidatePath(`/sessions/${r.data.id}`);
  revalidatePath("/sessions");
  revalidatePath("/planning");
}

export async function inscrireApprenant(
  _precedent: EtatFormulaire,
  donnees: FormData,
): Promise<EtatFormulaire> {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");

  const r = z
    .object({ sessionId: z.string().min(1), learnerId: z.string().min(1, "Choisissez un apprenant.") })
    .safeParse(Object.fromEntries(donnees));
  if (!r.success) return { erreur: r.error.issues[0]?.message ?? "Saisie invalide." };

  const [session, apprenant] = await Promise.all([
    prisma.trainingSession.findFirst({
      where: { id: r.data.sessionId, deletedAt: null },
      include: { _count: { select: { inscriptions: true } } },
    }),
    prisma.learner.findFirst({ where: { id: r.data.learnerId, deletedAt: null } }),
  ]);
  if (!session) return { erreur: "Session introuvable." };
  if (!apprenant) return { erreur: "Apprenant introuvable." };

  if (session.statut === "ANNULEE" || session.statut === "CLOTUREE") {
    return { erreur: "On ne peut plus inscrire d'apprenant à une session annulée ou clôturée." };
  }
  if (session.placesMax !== null && session._count.inscriptions >= session.placesMax) {
    return { erreur: `La session est complète (${session.placesMax} places).` };
  }

  try {
    await prisma.sessionLearner.create({
      data: { sessionId: session.id, learnerId: apprenant.id },
    });
  } catch (erreur) {
    if (erreur instanceof Prisma.PrismaClientKnownRequestError && erreur.code === "P2002") {
      return { erreur: `${apprenant.prenom} ${apprenant.nom} est déjà inscrit à cette session.` };
    }
    throw erreur;
  }

  // Une inscription fait sortir l'apprenant du stade de prospect ; si la
  // session a déjà démarré, il est directement en formation.
  const nouveauStatut = session.statut === "EN_COURS" ? "EN_FORMATION" : "INSCRIT";
  if (apprenant.statut === "PROSPECT" || (nouveauStatut === "EN_FORMATION" && apprenant.statut === "INSCRIT")) {
    await prisma.learner.update({ where: { id: apprenant.id }, data: { statut: nouveauStatut } });
  }

  await journaliser({
    action: "session.learner_added",
    summary: `${apprenant.prenom} ${apprenant.nom} inscrit à la session ${session.numero}`,
    entityType: "TrainingSession",
    entityId: session.id,
    userId: utilisateur.id,
    metadata: { learnerId: apprenant.id },
  });

  after(() => declencher({ type: "INSCRIPTION_SESSION", sessionId: session.id, learnerId: apprenant.id }));

  revalidatePath(`/sessions/${session.id}`);
  revalidatePath(`/apprenants/${apprenant.id}`);
  return {};
}

export async function desinscrireApprenant(donnees: FormData): Promise<void> {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");
  const r = z
    .object({ sessionId: z.string().min(1), learnerId: z.string().min(1) })
    .safeParse(Object.fromEntries(donnees));
  if (!r.success) return;

  const inscription = await prisma.sessionLearner.findUnique({
    where: { sessionId_learnerId: { sessionId: r.data.sessionId, learnerId: r.data.learnerId } },
    include: {
      session: { select: { numero: true } },
      learner: { select: { prenom: true, nom: true } },
    },
  });
  if (!inscription) return;

  await prisma.sessionLearner.delete({ where: { id: inscription.id } });

  await journaliser({
    action: "session.learner_removed",
    summary: `${inscription.learner.prenom} ${inscription.learner.nom} retiré de la session ${inscription.session.numero}`,
    entityType: "TrainingSession",
    entityId: r.data.sessionId,
    userId: utilisateur.id,
    metadata: { learnerId: r.data.learnerId },
  });

  revalidatePath(`/sessions/${r.data.sessionId}`);
  revalidatePath(`/apprenants/${r.data.learnerId}`);
}
