import "server-only";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import { adresseEntreprise } from "@/lib/entreprises-adresse";
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
    /// Période : saisie pour une session en ligne ; déduite des jours cochés
    /// sinon (premier et dernier).
    dateDebut: z.string().optional(),
    dateFin: z.string().optional(),
    /// Jours cochés sur le calendrier (« AAAA-MM-JJ » séparés par des virgules)
    jours: z.string().optional(),
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
    programmeId: texteFacultatif,
    placesMax: texteFacultatif.refine(
      (v) => v === undefined || (/^\d+$/.test(v) && Number(v) > 0),
      "Le nombre de places doit être un entier positif.",
    ),
    notes: texteFacultatif,
  })
  .transform((d, ctx) => {
    const choisis = [...new Set((d.jours ?? "").split(",").map((x) => x.trim()).filter(Boolean))]
      .map((x) => jourDepuisSaisie(x))
      .filter((x): x is Date => Boolean(x))
      .sort((a, b) => a.getTime() - b.getTime());
    const periode = enLigne(d.modalite) || choisis.length === 0;
    const dateDebut = periode ? jourDepuisSaisie(d.dateDebut ?? "") : choisis[0];
    const dateFin = periode ? jourDepuisSaisie(d.dateFin ?? "") : choisis[choisis.length - 1];
    if (!dateDebut || !dateFin) {
      ctx.addIssue({
        code: "custom",
        message: enLigne(d.modalite) ? "Indiquez la période de formation (début et fin)." : "Cochez les jours de formation sur le calendrier.",
      });
      return z.NEVER;
    }
    // En ligne, pas de jours de présence : la période suffit.
    return { ...d, dateDebut, dateFin, jours: enLigne(d.modalite) ? [] : choisis };
  })
  .refine((d) => !d.dateDebut || !d.dateFin || d.dateFin >= d.dateDebut, {
    message: "La date de fin ne peut pas précéder la date de début.",
  })
  // Formalogy ne forme qu'en ligne (client, 01/10/2026) : une session
  // interne est e-learning ou hybride, toujours avec sa plateforme.
  .refine((d) => d.attribution !== "FORMALOGY" || enLigne(d.modalite), {
    message: "Une session attribuée à Formalogy est en e-learning ou hybride : changez la modalité.",
  })
  .refine((d) => d.attribution !== "FORMALOGY" || Boolean(d.plateforme), {
    message: "Session attribuée à Formalogy : choisissez la plateforme e-learning.",
  })
  .transform((d) => {
    const interne = d.attribution === "FORMALOGY";
    return { ...d, interne, plateforme: interne && enLigne(d.modalite) && d.plateforme ? d.plateforme : null };
  });

/// Modalités qui passent par une plateforme e-learning.
export function enLigne(modalite: string) {
  return modalite === "E_LEARNING" || modalite === "HYBRIDE";
}

/// Programme de la session : un des programmes du formateur, obligatoire
/// dès que le formateur en a au moins un. Renvoie un message d'erreur.
export async function programmeInvalide(trainerId: string, programmeId: string | undefined): Promise<string | null> {
  const programmes = await prisma.document.findMany({
    where: { trainerId, deletedAt: null, type: { code: "PROGRAMME" } },
    select: { id: true },
  });
  if (programmeId) {
    return programmes.some((p) => p.id === programmeId) ? null : "Ce programme n'appartient pas au formateur choisi.";
  }
  return programmes.length > 0 ? "Choisissez le programme de formation du formateur." : null;
}

/// Lieu laissé vide : celui du formateur — son adresse de formation, ou
/// l'adresse de l'entreprise cliente s'il forme sur place.
export async function lieuParDefaut(lieu: string | undefined, trainerId: string, companyId: string | undefined, modalite: string) {
  if (lieu || modalite !== "PRESENTIEL") return lieu ?? null;
  const formateur = await prisma.trainer.findUnique({ where: { id: trainerId }, select: { lieu: true, lieuEntreprise: true, modalite: true } });
  if (!formateur || formateur.modalite !== "PRESENTIEL") return null;
  if (!formateur.lieuEntreprise) return formateur.lieu;
  const entreprise = companyId
    ? await prisma.company.findUnique({ where: { id: companyId }, select: { raisonSociale: true, adresse: true, codePostal: true, ville: true } })
    : null;
  return entreprise ? adresseEntreprise(entreprise) : null;
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
  const erreurProgramme = await programmeInvalide(d.trainerId, d.programmeId);
  if (erreurProgramme) return { erreur: erreurProgramme };

  const lieu = await lieuParDefaut(d.lieu, d.trainerId, d.companyId, d.modalite);
  const session = await creerAvecNumero(d.dateDebut.getUTCFullYear(), (numero) =>
    prisma.trainingSession.create({
      data: {
        numero,
        formationId: formation.id,
        companyId: d.companyId ?? null,
        dateDebut: d.dateDebut,
        dateFin: d.dateFin,
        jours: d.jours,
        horaires: d.horaires,
        lieu,
        modalite: d.modalite,
        interne: d.interne,
        plateforme: d.plateforme,
        statut: d.statut as never,
        trainerId: d.trainerId,
        programmeId: d.programmeId ?? null,
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
