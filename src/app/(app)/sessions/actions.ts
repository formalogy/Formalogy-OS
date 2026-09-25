"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { z } from "zod";

import { declencher, executerPlanifiees } from "@/lib/automatisations/moteur";
import { genererConvention } from "@/lib/conventions";
import { lireMontant } from "@/lib/factures";
import { journaliser } from "@/lib/journal";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";
import { appliquerStatutSession } from "@/lib/sessions-statut";
import { formaterPeriode, jourDepuisSaisie, STATUTS_SESSION } from "@/lib/sessions-libelles";

export type EtatConventions = { erreur?: string; succes?: string; manquants?: string[] };

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
    /// Absent du formulaire de création : une nouvelle session est un
    /// brouillon, qui ne déclenche aucune automatisation tant qu'on ne l'a
    /// pas mise en route.
    statut: z.enum(STATUTS_SESSION as [string, ...string[]]).optional().default("BROUILLON"),
    trainerId: texteFacultatif,
    placesMax: texteFacultatif.refine(
      (v) => v === undefined || (/^\d+$/.test(v) && Number(v) > 0),
      "Le nombre de places doit être un entier positif.",
    ),
    notes: texteFacultatif,
  })
  .refine((d) => !d.dateDebut || !d.dateFin || d.dateFin >= d.dateDebut, {
    message: "La date de fin ne peut pas précéder la date de début.",
  });

/// Un formateur ne peut être affecté que s'il existe et est actif.
async function formateurValide(trainerId: string) {
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

  if (d.trainerId && !(await formateurValide(d.trainerId))) {
    return { erreur: "Ce formateur n'est plus disponible. Rechargez la page.", valeurs: saisie(donnees) };
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
        trainerId: d.trainerId ?? null,
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

  if (d.trainerId && d.trainerId !== existante.trainerId && !(await formateurValide(d.trainerId))) {
    return { erreur: "Ce formateur n'est plus disponible. Rechargez la page.", valeurs: saisie(donnees) };
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
      trainerId: d.trainerId ?? null,
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

/// Change le statut d'une session (voir lib/sessions-statut.ts). Une session qui
/// s'achève déclenche ses suites ; une session passée par « terminée » puis
/// « clôturée » ne les déclenche qu'une fois.
async function appliquerStatut(sessionId: string, statut: (typeof STATUTS_SESSION)[number], userId: string) {
  const { acheve } = await appliquerStatutSession(sessionId, statut, userId);
  if (acheve) after(() => declencher({ type: "SESSION_TERMINEE", sessionId }));
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

/// Cœur de l'inscription, partagé entre la fiche session (reste sur place) et
/// la fiche apprenant (repart vers la fiche une fois inscrit).
async function inscrire(
  sessionId: string,
  learnerId: string,
  prixHT: string,
  utilisateur: { id: string },
): Promise<EtatFormulaire> {
  const [session, apprenant] = await Promise.all([
    prisma.trainingSession.findFirst({
      where: { id: sessionId, deletedAt: null },
      include: { _count: { select: { inscriptions: true } } },
    }),
    prisma.learner.findFirst({ where: { id: learnerId, deletedAt: null } }),
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
      data: { sessionId: session.id, learnerId: apprenant.id, prixHT },
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
    summary: `${apprenant.prenom} ${apprenant.nom} inscrit à la session ${session.numero} (${prixHT.replace(".", ",")} € HT)`,
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

/// Le tarif de l'apprenant est indiqué à l'inscription (décision du client) :
/// c'est le montant de sa facture personnelle.
const schemaInscription = z.object({
  sessionId: z.string().min(1),
  learnerId: z.string().min(1, "Choisissez un apprenant."),
  prixHT: z
    .string()
    .transform((saisie) => lireMontant(saisie))
    .refine((montant): montant is string => montant !== null, "Indiquez le tarif HT de l'apprenant (par exemple 1200 ou 1 200,50)."),
});

export async function inscrireApprenant(
  _precedent: EtatFormulaire,
  donnees: FormData,
): Promise<EtatFormulaire> {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");
  const r = schemaInscription.safeParse(Object.fromEntries(donnees));
  if (!r.success) return { erreur: r.error.issues[0]?.message ?? "Saisie invalide." };
  return inscrire(r.data.sessionId, r.data.learnerId, r.data.prixHT, utilisateur);
}

/// Même inscription, mais depuis la fiche d'un apprenant qui vient d'être
/// créé : une fois inscrit, on repart directement sur sa fiche.
export async function inscrireApprenantEtVoirFiche(
  _precedent: EtatFormulaire,
  donnees: FormData,
): Promise<EtatFormulaire> {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");
  const r = schemaInscription.safeParse(Object.fromEntries(donnees));
  if (!r.success) return { erreur: r.error.issues[0]?.message ?? "Saisie invalide." };

  const resultat = await inscrire(r.data.sessionId, r.data.learnerId, r.data.prixHT, utilisateur);
  if (resultat.erreur) return resultat;

  redirect(`/apprenants/${r.data.learnerId}`);
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

/// Génère (ou régénère) la convention de chaque apprenant inscrit, à partir
/// du modèle déposé dans la bibliothèque. Même moteur que l'automatisation de
/// J-15 : ce bouton sert quand la session est créée trop tard pour elle, ou
/// quand une donnée a changé depuis.
export async function genererConventionsSession(
  _precedent: EtatConventions,
  donnees: FormData,
): Promise<EtatConventions> {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");
  const sessionId = String(donnees.get("sessionId") ?? "");

  const inscriptions = await prisma.sessionLearner.findMany({
    where: { sessionId, learner: { deletedAt: null } },
    include: { learner: { select: { id: true, prenom: true, nom: true } } },
  });
  if (inscriptions.length === 0) return { erreur: "Aucun apprenant inscrit à cette session." };

  const comptes = { crees: 0, misAJour: 0, inchanges: 0 };
  const manquants = new Set<string>();
  let erreur: string | undefined;

  for (const { learner } of inscriptions) {
    const r = await genererConvention({ sessionId, learnerId: learner.id, userId: utilisateur.id });
    if ("erreur" in r) {
      // Un modèle absent concerne toute la session : inutile d'insister.
      erreur = r.erreur;
      break;
    }
    if (r.etat === "cree") comptes.crees++;
    else if (r.etat === "nouvelle_version") comptes.misAJour++;
    else comptes.inchanges++;
    for (const m of r.nonRemplis) manquants.add(m);
  }

  if (erreur) return { erreur };

  await journaliser({
    action: "session.conventions_generated",
    summary: `Conventions générées pour la session : ${comptes.crees} créée(s), ${comptes.misAJour} mise(s) à jour`,
    entityType: "TrainingSession",
    entityId: sessionId,
    userId: utilisateur.id,
  });

  revalidatePath(`/sessions/${sessionId}`);
  const parties = [
    comptes.crees && `${comptes.crees} créée(s)`,
    comptes.misAJour && `${comptes.misAJour} mise(s) à jour`,
    comptes.inchanges && `${comptes.inchanges} inchangée(s)`,
  ].filter(Boolean);
  return { succes: `Conventions : ${parties.join(", ")}.`, manquants: [...manquants].sort() };
}

export type EtatDeroulement = { erreur?: string; succes?: string };

/// Met une session en route : elle quitte le brouillon, et ce qui lui est
/// déjà dû part sans attendre le réveil du lendemain.
///
/// C'est le geste unique attendu après la création : tant qu'une session est
/// un brouillon, aucune automatisation ne la regarde.
export async function lancerDeroulementSession(
  _precedent: EtatDeroulement,
  donnees: FormData,
): Promise<EtatDeroulement> {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");
  const id = String(donnees.get("id") ?? "");

  const session = await prisma.trainingSession.findFirst({
    where: { id, deletedAt: null },
    include: { _count: { select: { inscriptions: true } } },
  });
  if (!session) return { erreur: "Session introuvable." };
  if (session.statut === "ANNULEE") return { erreur: "Cette session est annulée." };

  if (session.statut === "BROUILLON") {
    await prisma.trainingSession.update({ where: { id }, data: { statut: "A_PREPARER" } });
    await journaliser({
      action: "session.started",
      summary: `Déroulement automatique lancé pour la session ${session.numero}`,
      entityType: "TrainingSession",
      entityId: id,
      userId: utilisateur.id,
    });
  }

  // Le moteur reprend tous les cas dus, cette session comprise. Chaque cas
  // étant réservé par une clé unique, relancer n'envoie jamais deux fois.
  const bilan = await executerPlanifiees();

  revalidatePath(`/sessions/${id}`);
  revalidatePath("/sessions");

  const sansInscrit = session._count.inscriptions === 0;
  const traites = bilan.traites > 0 ? `${bilan.traites} envoi(s) ou document(s) déclenché(s).` : "Rien à envoyer pour l'instant.";
  return {
    succes: sansInscrit
      ? `Session en route. ${traites} Attention : personne n'est encore inscrit, les envois aux apprenants ne partiront qu'une fois les inscriptions faites.`
      : `Session en route. ${traites}`,
  };
}

/// Alerte du client sur une session lancée : « suspendre » arrête tout ce qui
/// devait partir (envois, documents, changement de statut, facture) ;
/// « reprendre » relance le déroulement là où il en est. Une session terminée
/// pendant la suspension retrouve ses suites (facture) à la reprise, sans
/// doublon possible.
export async function piloterDeroulementSession(
  _precedent: EtatDeroulement,
  donnees: FormData,
): Promise<EtatDeroulement> {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");
  const id = String(donnees.get("id") ?? "");
  const operation = donnees.get("operation");

  const session = await prisma.trainingSession.findFirst({ where: { id, deletedAt: null } });
  if (!session) return { erreur: "Session introuvable." };

  if (operation === "suspendre") {
    if (session.deroulementSuspenduAt) return { succes: "Le déroulement était déjà suspendu." };
    await prisma.trainingSession.update({ where: { id }, data: { deroulementSuspenduAt: new Date() } });
    await journaliser({
      action: "session.suspended",
      summary: `Déroulement automatique suspendu pour la session ${session.numero}`,
      entityType: "TrainingSession",
      entityId: id,
      userId: utilisateur.id,
    });
    revalidatePath(`/sessions/${id}`);
    return { succes: "Déroulement suspendu : plus rien ne part pour cette session tant que vous ne le reprenez pas." };
  }

  if (operation === "reprendre") {
    if (!session.deroulementSuspenduAt) return { succes: "Le déroulement n'était pas suspendu." };
    await prisma.trainingSession.update({ where: { id }, data: { deroulementSuspenduAt: null } });
    await journaliser({
      action: "session.resumed",
      summary: `Déroulement automatique repris pour la session ${session.numero}`,
      entityType: "TrainingSession",
      entityId: id,
      userId: utilisateur.id,
    });
    if (session.statut === "TERMINEE" || session.statut === "CLOTUREE") {
      await declencher({ type: "SESSION_TERMINEE", sessionId: id });
    }
    // Ce qui est dû part sans attendre le prochain réveil.
    const bilan = await executerPlanifiees();
    revalidatePath(`/sessions/${id}`);
    revalidatePath("/sessions");
    return {
      succes: `Déroulement repris. ${bilan.traites > 0 ? `${bilan.traites} envoi(s) ou document(s) déclenché(s).` : "Rien d'autre à envoyer pour l'instant."}`,
    };
  }

  return { erreur: "Opération inconnue." };
}

/// Corrige le tarif d'un apprenant inscrit. Impossible une fois sa facture
/// personnelle émise : le montant facturé ne doit plus diverger.
export async function modifierTarifInscription(_precedent: EtatFormulaire, donnees: FormData): Promise<EtatFormulaire> {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");
  const r = schemaInscription.safeParse(Object.fromEntries(donnees));
  if (!r.success) return { erreur: r.error.issues[0]?.message ?? "Saisie invalide." };
  const { sessionId, learnerId, prixHT } = r.data;

  const inscription = await prisma.sessionLearner.findUnique({
    where: { sessionId_learnerId: { sessionId, learnerId } },
    include: { learner: { select: { prenom: true, nom: true } }, session: { select: { numero: true } } },
  });
  if (!inscription) return { erreur: "Inscription introuvable." };
  const facturee = await prisma.facture.count({ where: { sessionId, learnerId, statut: { not: "ANNULEE" } } });
  if (facturee > 0) return { erreur: "Sa facture est déjà émise : le tarif ne peut plus changer." };

  await prisma.sessionLearner.update({ where: { id: inscription.id }, data: { prixHT } });
  await journaliser({
    action: "session.learner_price_changed",
    summary: `Tarif de ${inscription.learner.prenom} ${inscription.learner.nom} pour la session ${inscription.session.numero} : ${prixHT.replace(".", ",")} € HT`,
    entityType: "TrainingSession",
    entityId: sessionId,
    userId: utilisateur.id,
  });
  revalidatePath(`/sessions/${sessionId}`);
  return {};
}
