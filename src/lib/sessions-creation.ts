import "server-only";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import { journaliser } from "@/lib/journal";
import { prisma } from "@/lib/prisma";
import { formaterPeriode, jourDepuisSaisie, STATUTS_SESSION } from "@/lib/sessions-libelles";

/// Création d'une session, partagée entre le formulaire et l'assistant IA
/// (une proposition validée par l'utilisateur).

const texteFacultatif = z
  .string()
  .trim()
  .transform((valeur) => (valeur === "" ? undefined : valeur))
  .optional();

export const schemaSession = z
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
    /// Attribuée à Formalogy (en interne) ou au formateur.
    attribution: z.enum(["FORMALOGY", "FORMATEUR"]).optional().default("FORMATEUR"),
    /// Plateforme : seulement pour une session interne en ligne, où elle est
    /// obligatoire.
    plateforme: z.enum(["EFORMA", "MON_PARCOURS_EN_LIGNE", ""]).optional(),
    /// Absent du formulaire de création : une nouvelle session est un
    /// brouillon, qui ne déclenche aucune automatisation tant qu'on ne l'a
    /// pas mise en route.
    statut: z.enum(STATUTS_SESSION as [string, ...string[]]).optional().default("BROUILLON"),
    trainerId: z.string().trim().min(1, "Choisissez le formateur : il est obligatoire, même pour une formation en interne."),
    placesMax: texteFacultatif.refine(
      (v) => v === undefined || (/^\d+$/.test(v) && Number(v) > 0),
      "Le nombre de places doit être un entier positif.",
    ),
    notes: texteFacultatif,
  })
  .refine((d) => !d.dateDebut || !d.dateFin || d.dateFin >= d.dateDebut, {
    message: "La date de fin ne peut pas précéder la date de début.",
  })
  .refine((d) => d.attribution !== "FORMALOGY" || !enLigne(d.modalite) || Boolean(d.plateforme), {
    message: "Session en interne et en ligne : choisissez la plateforme e-learning.",
  })
  .transform((d) => {
    const interne = d.attribution === "FORMALOGY";
    return { ...d, interne, plateforme: interne && enLigne(d.modalite) && d.plateforme ? d.plateforme : null };
  });

/// Modalités qui passent par une plateforme e-learning.
export function enLigne(modalite: string) {
  return modalite === "E_LEARNING" || modalite === "HYBRIDE";
}

/// Un formateur ne peut être affecté que s'il existe et est actif.
export async function formateurValide(trainerId: string) {
  return Boolean(await prisma.trainer.findFirst({ where: { id: trainerId, deletedAt: null, actif: true } }));
}

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

export async function creerSessionBrouillon(
  d: z.infer<typeof schemaSession>,
  userId: string,
): Promise<{ erreur: string } | { session: { id: string; numero: string } }> {
  // Une formation en brouillon ou archivée ne peut pas donner lieu à une
  // nouvelle session.
  const formation = await prisma.formation.findFirst({
    where: { id: d.formationId, deletedAt: null, statut: "ACTIVE" },
  });
  if (!formation) {
    return { erreur: "Cette formation n'est pas active dans le catalogue." };
  }

  if (d.trainerId && !(await formateurValide(d.trainerId))) {
    return { erreur: "Ce formateur n'est plus disponible. Rechargez la page." };
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
        interne: d.interne,
        plateforme: d.plateforme,
        statut: d.statut as never,
        trainerId: d.trainerId,
        placesMax: d.placesMax ? Number(d.placesMax) : null,
        prixHT: formation.prixHT,
        notes: d.notes,
        createdById: userId,
      },
    }),
  );

  await journaliser({
    action: "session.created",
    summary: `Session ${session.numero} créée : ${formation.titre} — ${formaterPeriode(d.dateDebut, d.dateFin)}`,
    entityType: "TrainingSession",
    entityId: session.id,
    userId: userId,
  });

  return { session };
}
