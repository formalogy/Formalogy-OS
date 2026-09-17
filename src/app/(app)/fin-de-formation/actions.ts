"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { sessionPourEmargement } from "@/lib/emargement-acces";
import { genererDocumentsFinDeFormation } from "@/lib/fin-de-formation";
import { journaliser } from "@/lib/journal";
import { prisma } from "@/lib/prisma";
import { envoyerQuestionnaires } from "@/lib/satisfaction";
import { exigerRole, exigerUtilisateur } from "@/lib/session";
import { aujourdhuiUTC } from "@/lib/sessions-libelles";

export type EtatEvaluation = { erreur?: string; succes?: string };
export type EtatGeneration = { erreur?: string; succes?: string; ignores?: string[] };

function rafraichir(sessionId: string) {
  revalidatePath(`/sessions/${sessionId}`, "layout");
  revalidatePath(`/mes-sessions/${sessionId}`, "layout");
  revalidatePath("/attestations");
}

/// Évaluation des acquis : par l'équipe ou par le formateur de la session,
/// une fois la session commencée.
export async function enregistrerEvaluation(_precedent: EtatEvaluation, donnees: FormData): Promise<EtatEvaluation> {
  const utilisateur = await exigerUtilisateur();
  const r = z
    .object({
      sessionId: z.string().min(1),
      learnerId: z.string().min(1),
      resultat: z.enum(["ACQUIS", "PARTIELLEMENT_ACQUIS", "NON_ACQUIS"], { message: "Choisissez un résultat." }),
      commentaire: z.string().trim().max(600, "Commentaire trop long (600 caractères maximum)."),
    })
    .safeParse({
      sessionId: donnees.get("sessionId"),
      learnerId: donnees.get("learnerId"),
      resultat: donnees.get("resultat"),
      commentaire: donnees.get("commentaire") ?? "",
    });
  if (!r.success) return { erreur: r.error.issues[0]?.message ?? "Saisie invalide." };

  const session = await sessionPourEmargement(utilisateur, r.data.sessionId);
  if (!session) return { erreur: "Session introuvable." };
  if (session.dateDebut > aujourdhuiUTC()) return { erreur: "La session n'a pas encore commencé." };
  if (!session.inscriptions.some((i) => i.learner.id === r.data.learnerId)) {
    return { erreur: "Cet apprenant n'est pas inscrit à la session." };
  }

  const cle = { sessionId: session.id, learnerId: r.data.learnerId };
  const valeurs = { resultat: r.data.resultat, commentaire: r.data.commentaire || null, saisieParId: utilisateur.id };
  await prisma.evaluationAcquis.upsert({
    where: { sessionId_learnerId: cle },
    create: { ...cle, ...valeurs },
    update: valeurs,
  });

  rafraichir(session.id);
  return { succes: "Enregistré" };
}

export async function genererAttestations(_precedent: EtatGeneration, donnees: FormData): Promise<EtatGeneration> {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");
  const sessionId = String(donnees.get("sessionId") ?? "");

  let r;
  try {
    r = await genererDocumentsFinDeFormation(sessionId, utilisateur.id);
  } catch (erreur) {
    console.error("Génération des attestations impossible :", erreur);
    return { erreur: "La génération a échoué. Réessayez dans un instant." };
  }
  if ("erreur" in r) return { erreur: r.erreur };

  rafraichir(sessionId);
  revalidatePath("/documents");
  const { crees, misAJour, inchanges, ignores } = r.resultats;
  const parties = [
    crees && `${crees} document(s) créé(s)`,
    misAJour && `${misAJour} mis à jour`,
    inchanges && `${inchanges} déjà à jour`,
  ].filter(Boolean);
  return {
    succes: parties.length ? `${parties.join(", ")}.` : "Aucun document généré.",
    ignores,
  };
}

export async function envoyerQuestionnairesSession(_precedent: EtatGeneration, donnees: FormData): Promise<EtatGeneration> {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");
  const sessionId = String(donnees.get("sessionId") ?? "");
  const session = await prisma.trainingSession.findFirst({ where: { id: sessionId, deletedAt: null } });
  if (!session) return { erreur: "Session introuvable." };
  if (session.dateFin > aujourdhuiUTC()) return { erreur: "Le questionnaire s'envoie à partir du dernier jour de la session." };

  const r = await envoyerQuestionnaires(sessionId, utilisateur.id);
  if ("erreur" in r) return { erreur: r.erreur };

  const b = r.bilan;
  await journaliser({
    action: "satisfaction.sent",
    summary: `Questionnaires de satisfaction de la session ${session.numero} : ${b.envoyes} envoyé(s), ${b.simules} simulé(s)`,
    entityType: "TrainingSession",
    entityId: sessionId,
    userId: utilisateur.id,
  });
  rafraichir(sessionId);
  const parties = [
    b.envoyes && `${b.envoyes} envoyé(s)`,
    b.simules && `${b.simules} simulé(s) (envoi réel désactivé)`,
    b.dejaRepondu && `${b.dejaRepondu} déjà répondu`,
    b.sansAdresse && `${b.sansAdresse} sans adresse email`,
    b.echecs && `${b.echecs} en échec (voir l'historique des emails)`,
  ].filter(Boolean);
  return { succes: parties.length ? `${parties.join(", ")}.` : "Aucun apprenant." };
}
