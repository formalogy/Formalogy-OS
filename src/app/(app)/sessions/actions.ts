"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { z } from "zod";

import { declencher, executerPlanifiees } from "@/lib/automatisations/moteur";
import { genererConvention } from "@/lib/conventions";
import { lireMontant } from "@/lib/factures";
import { creerSessionBrouillon, creerSessionDepuisFormation, seancesAPlanifier, formateurValide, lieuParDefaut, programmeInvalide, schemaSession } from "@/lib/sessions-creation";
import { decrirePayeur, estFinanceurTiers, PAYEURS_INSCRIPTION } from "@/lib/inscriptions-facturation";
import { journaliser } from "@/lib/journal";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";
import { appliquerStatutSession } from "@/lib/sessions-statut";
import { genererDocumentsFinDeFormation } from "@/lib/fin-de-formation";
import { envoyerDocumentsFinStagiaire } from "@/lib/fin-de-parcours";
import { modaliteEnLigne } from "@/lib/formations-libelles";
import { aujourdhuiUTC, formaterPeriode, STATUTS_SESSION } from "@/lib/sessions-libelles";

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

  // Session créée pour un stagiaire (depuis sa fiche) : son inscription est
  // vérifiée avant toute création, pour ne rien laisser à moitié fait.
  const learnerId = String(donnees.get("learnerId") ?? "");
  if (learnerId) {
    const avant = schemaInscription.safeParse({ ...Object.fromEntries(donnees), sessionId: "avant-creation" });
    if (!avant.success) return { erreur: avant.error.issues[0]?.message ?? "Inscription invalide.", valeurs: saisie(donnees) };
    if (!(await prisma.learner.findFirst({ where: { id: learnerId, deletedAt: null } }))) {
      return { erreur: "Ce stagiaire n'existe plus.", valeurs: saisie(donnees) };
    }
  }

  const cree = await creerSessionBrouillon(d, utilisateur.id);
  if ("erreur" in cree) return { erreur: cree.erreur, valeurs: saisie(donnees) };
  const { session } = cree;
  revalidatePath("/sessions");

  if (learnerId) {
    const inscription = new FormData();
    for (const [cle, valeur] of donnees.entries()) if (typeof valeur === "string") inscription.set(cle, valeur);
    inscription.set("sessionId", session.id);
    const i = await inscrireApprenant({}, inscription);
    // La session existe : en cas d'échec, l'inscription se refait depuis sa fiche.
    if (!i.erreur && donnees.get("lancer") === "on") {
      const lancement = new FormData();
      lancement.set("id", session.id);
      await lancerDeroulementSession({}, lancement);
    }
  }

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

  const erreurProgramme = await programmeInvalide(d.trainerId, d.programmeId);
  if (erreurProgramme) return { erreur: erreurProgramme, valeurs: saisie(donnees) };

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
      jours: d.jours,
      horaires: d.horaires ?? null,
      lieu: await lieuParDefaut(d.lieu, d.trainerId, d.companyId, d.modalite),
      modalite: d.modalite,
      interne: d.interne,
      plateforme: d.plateforme,
      trainerId: d.trainerId,
      programmeId: d.programmeId ?? null,
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
  facturation: Facturation,
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
  const companyId = apprenant.companyId ?? session.companyId;
  if (facturation.facturerA === "ENTREPRISE" && !companyId) {
    return { erreur: "Cet apprenant n'est rattaché à aucune entreprise : rattachez-le d'abord, ou choisissez un autre payeur." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const dossier = await creerDossierFinancement(tx, facturation, { sessionId: session.id, learnerId: apprenant.id, companyId, userId: utilisateur.id });
      await tx.sessionLearner.create({
        data: {
          sessionId: session.id,
          learnerId: apprenant.id,
          prixHT: facturation.prixHT,
          facturerA: facturation.facturerA,
          dossierFinancementId: dossier?.id,
        },
      });
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
    summary: `${apprenant.prenom} ${apprenant.nom} inscrit à la session ${session.numero} (${facturation.prixHT.replace(".", ",")} € HT, ${decrirePayeur(facturation.facturerA, { financeur: facturation.financeurNom, dossier: facturation.financeurReference })})`,
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

/// Facturation d'une inscription (décision du client) : à qui facturer, au
/// tarif indiqué ; pour un financeur en subrogation (OPCO, France Travail),
/// son nom, qui figurera sur la facture, et son numéro de dossier.
const texteOptionnel = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || undefined);
const schemaInscription = z
  .object({
    sessionId: z.string().min(1),
    learnerId: z.string().min(1, "Choisissez un apprenant."),
    facturerA: z.enum(PAYEURS_INSCRIPTION, { message: "Choisissez à qui facturer." }),
    prixHT: z
      .string()
      .transform((saisie) => lireMontant(saisie))
      .refine((montant): montant is string => montant !== null, "Indiquez le tarif HT de l'apprenant (par exemple 1200 ou 1 200,50)."),
    financeurNom: texteOptionnel(200),
    financeurReference: texteOptionnel(100),
    financeurEmail: z
      .union([z.literal(""), z.email("L'adresse email du financeur n'est pas valide.")])
      .optional()
      .transform((v) => v || undefined),
  })
  .superRefine((d, ctx) => {
    if (estFinanceurTiers(d.facturerA) && !d.financeurNom) {
      ctx.addIssue({ code: "custom", message: "Indiquez le nom du financeur à facturer (par exemple OPCO EP)." });
    }
  });
type Facturation = Omit<z.infer<typeof schemaInscription>, "sessionId" | "learnerId">;

/// Dossier de financement d'un financeur facturé en subrogation, créé avec
/// l'inscription : il apparaît dans « Financements » et porte le nom qui
/// figurera sur la facture.
async function creerDossierFinancement(
  tx: Prisma.TransactionClient,
  f: Facturation,
  lien: { sessionId: string; learnerId: string; companyId: string | null; userId: string },
) {
  if (!estFinanceurTiers(f.facturerA) || !f.financeurNom) return null;
  return tx.dossierFinancement.create({
    data: {
      financeurType: f.facturerA === "OPCO" ? "OPCO" : "FRANCE_TRAVAIL",
      financeurNom: f.financeurNom,
      reference: f.financeurReference,
      email: f.financeurEmail,
      montant: f.prixHT,
      subrogation: true,
      sessionId: lien.sessionId,
      learnerId: lien.learnerId,
      companyId: lien.companyId,
      createdById: lien.userId,
    },
  });
}

export async function inscrireApprenant(
  _precedent: EtatFormulaire,
  donnees: FormData,
): Promise<EtatFormulaire> {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");
  const r = schemaInscription.safeParse(Object.fromEntries(donnees));
  if (!r.success) return { erreur: r.error.issues[0]?.message ?? "Saisie invalide." };
  return inscrire(r.data.sessionId, r.data.learnerId, r.data, utilisateur);
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

  const resultat = await inscrire(r.data.sessionId, r.data.learnerId, r.data, utilisateur);
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
  // Session née du catalogue : ce qui manque se complète avant de lancer.
  if (seancesAPlanifier(session)) return { erreur: "Planifiez d'abord les séances : cochez les jours de formation (Modifier la session)." };
  if (!session.trainerId) return { erreur: "Choisissez d'abord le formateur (Modifier la session)." };

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

/// Corrige la facturation d'un apprenant inscrit (payeur, tarif, financeur).
/// Impossible une fois l'inscription facturée : le montant et le payeur
/// facturés ne doivent plus diverger.
export async function modifierFacturationInscription(_precedent: EtatFormulaire, donnees: FormData): Promise<EtatFormulaire> {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");
  const r = schemaInscription.safeParse(Object.fromEntries(donnees));
  if (!r.success) return { erreur: r.error.issues[0]?.message ?? "Saisie invalide." };
  const { sessionId, learnerId, ...facturation } = r.data;

  const inscription = await prisma.sessionLearner.findUnique({
    where: { sessionId_learnerId: { sessionId, learnerId } },
    include: {
      learner: { select: { prenom: true, nom: true, companyId: true } },
      session: { select: { numero: true, companyId: true } },
    },
  });
  if (!inscription) return { erreur: "Inscription introuvable." };
  if (inscription.factureId) return { erreur: "Cette inscription est déjà facturée : sa facturation ne peut plus changer." };
  const companyId = inscription.learner.companyId ?? inscription.session.companyId;
  if (facturation.facturerA === "ENTREPRISE" && !companyId) {
    return { erreur: "Cet apprenant n'est rattaché à aucune entreprise : rattachez-le d'abord, ou choisissez un autre payeur." };
  }

  await prisma.$transaction(async (tx) => {
    // Le dossier créé avec l'inscription suit le payeur : mis à jour s'il
    // reste un financeur, supprimé sinon (il n'a encore aucune facture).
    let dossierFinancementId = inscription.dossierFinancementId;
    if (estFinanceurTiers(facturation.facturerA) && dossierFinancementId) {
      await tx.dossierFinancement.update({
        where: { id: dossierFinancementId },
        data: {
          financeurType: facturation.facturerA === "OPCO" ? "OPCO" : "FRANCE_TRAVAIL",
          financeurNom: facturation.financeurNom,
          reference: facturation.financeurReference ?? null,
          email: facturation.financeurEmail ?? null,
          montant: facturation.prixHT,
          companyId,
        },
      });
    } else if (estFinanceurTiers(facturation.facturerA)) {
      dossierFinancementId =
        (await creerDossierFinancement(tx, facturation, { sessionId, learnerId, companyId, userId: utilisateur.id }))?.id ?? null;
    } else if (dossierFinancementId) {
      await tx.sessionLearner.update({ where: { id: inscription.id }, data: { dossierFinancementId: null } });
      await tx.dossierFinancement.delete({ where: { id: dossierFinancementId } });
      dossierFinancementId = null;
    }
    await tx.sessionLearner.update({
      where: { id: inscription.id },
      data: { prixHT: facturation.prixHT, facturerA: facturation.facturerA, dossierFinancementId },
    });
  });

  await journaliser({
    action: "session.learner_billing_changed",
    summary: `Facturation de ${inscription.learner.prenom} ${inscription.learner.nom} pour la session ${inscription.session.numero} : ${facturation.prixHT.replace(".", ",")} € HT, ${decrirePayeur(facturation.facturerA, { financeur: facturation.financeurNom, dossier: facturation.financeurReference })}`,
    entityType: "TrainingSession",
    entityId: sessionId,
    userId: utilisateur.id,
  });
  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath("/financements");
  return {};
}

export type EtatFinParcours = { erreur?: string; succes?: string };

/// Session en ligne : le stagiaire a terminé son parcours (100 % sur la
/// plateforme). Sa formation est finie à cette date : évaluation des acquis,
/// attestation et certificat envoyés aussitôt ; la facture suit dès que tous
/// les inscrits ont terminé (preuve de réalisation).
export async function validerFinParcours(_precedent: EtatFinParcours, donnees: FormData): Promise<EtatFinParcours> {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");
  const r = z
    .object({
      sessionId: z.string().min(1),
      learnerId: z.string().min(1),
      resultat: z.enum(["ACQUIS", "PARTIELLEMENT_ACQUIS", "NON_ACQUIS"], { message: "Choisissez l'évaluation des acquis." }),
    })
    .safeParse(Object.fromEntries(donnees));
  if (!r.success) return { erreur: r.error.issues[0]?.message ?? "Saisie invalide." };
  const { sessionId, learnerId, resultat } = r.data;

  const inscription = await prisma.sessionLearner.findUnique({
    where: { sessionId_learnerId: { sessionId, learnerId } },
    include: { session: { select: { numero: true, modalite: true, statut: true, deletedAt: true } }, learner: { select: { prenom: true, nom: true } } },
  });
  if (!inscription || inscription.session.deletedAt) return { erreur: "Inscription introuvable." };
  if (!modaliteEnLigne(inscription.session.modalite)) return { erreur: "Réservé aux sessions en ligne (e-learning ou hybride)." };
  if (inscription.session.statut === "ANNULEE") return { erreur: "Cette session est annulée." };
  if (inscription.parcoursTermineLe) return { erreur: "Ce parcours est déjà validé." };

  const aujourdhui = aujourdhuiUTC();
  await prisma.$transaction([
    prisma.sessionLearner.update({ where: { id: inscription.id }, data: { parcoursTermineLe: aujourdhui } }),
    prisma.evaluationAcquis.upsert({
      where: { sessionId_learnerId: { sessionId, learnerId } },
      create: { sessionId, learnerId, resultat, saisieParId: utilisateur.id },
      update: { resultat, saisieParId: utilisateur.id },
    }),
    prisma.learner.update({ where: { id: learnerId }, data: { statut: "TERMINE" } }),
  ]);
  const nom = `${inscription.learner.prenom} ${inscription.learner.nom}`;
  await journaliser({
    action: "session.parcours_completed",
    summary: `Parcours en ligne terminé (100 %) : ${nom} — session ${inscription.session.numero}`,
    entityType: "TrainingSession",
    entityId: sessionId,
    userId: utilisateur.id,
  });

  // Attestation et certificat tout de suite, puis l'email qui les porte.
  const docs = await genererDocumentsFinDeFormation(sessionId, utilisateur.id);
  let suite: string;
  if ("erreur" in docs) suite = ` Documents en attente : ${docs.erreur}`;
  else {
    const echec = await envoyerDocumentsFinStagiaire(sessionId, learnerId, utilisateur.id);
    suite = echec ? ` Documents générés, mais non envoyés : ${echec}.` : " Attestation et certificat envoyés.";
  }
  // La facture part si tous les inscrits ont terminé.
  after(() => executerPlanifiees());

  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath(`/apprenants/${learnerId}`);
  return { succes: `Parcours de ${nom} validé.${suite}` };
}

/// « Créer une session » depuis le catalogue : la session naît pré-remplie
/// d'après la formation choisie, puis se complète depuis sa fiche.
export async function creerSessionCatalogue(donnees: FormData): Promise<void> {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");
  const formationId = String(donnees.get("formationId") ?? "");
  const r = await creerSessionDepuisFormation(
    {
      formationId,
      trainerId: String(donnees.get("formateur") ?? "") || undefined,
      companyId: String(donnees.get("entreprise") ?? "") || undefined,
    },
    utilisateur.id,
  );
  if ("erreur" in r) redirect(`/sessions/nouvelle?erreur=${encodeURIComponent(r.erreur)}`);
  revalidatePath("/sessions");
  redirect(`/sessions/${r.session.id}`);
}
