import "server-only";

import { construireContexte } from "@/lib/emails/contexte";
import { rendre } from "@/lib/emails/modeles";
import { prisma } from "@/lib/prisma";

/// Email d'un modèle rempli pour un apprenant (et sa session), tel qu'il
/// partira : sert à l'aperçu de la proposition de l'assistant puis à l'envoi
/// validé, qui le recalcule (rien n'est repris du navigateur).
export async function emailDepuisModele(p: { learnerId: string; modeleCode: string; sessionId?: string }) {
  const [modele, apprenant] = await Promise.all([
    prisma.emailTemplate.findUnique({ where: { code: p.modeleCode } }),
    prisma.learner.findFirst({ where: { id: p.learnerId, deletedAt: null } }),
  ]);
  if (!modele || !modele.actif) throw new Error(`modèle d'email « ${p.modeleCode} » introuvable ou désactivé`);
  if (!apprenant) throw new Error("apprenant introuvable (identifiant inconnu)");
  if (!apprenant.email) throw new Error(`${apprenant.prenom} ${apprenant.nom} n'a pas d'adresse email`);
  if (p.sessionId && !(await prisma.sessionLearner.findFirst({ where: { sessionId: p.sessionId, learnerId: apprenant.id } }))) {
    throw new Error("cet apprenant n'est pas inscrit à cette session");
  }

  const contexte = await construireContexte({ learnerId: apprenant.id, sessionId: p.sessionId, companyId: apprenant.companyId ?? undefined });
  const sujet = rendre(modele.sujet, contexte);
  const corps = rendre(modele.corps, contexte);
  return {
    modele,
    apprenant,
    destinataire: apprenant.email,
    sujet: sujet.resultat,
    corps: corps.resultat,
    // Le mot de passe de première connexion ne reste pas en clair dans l'historique.
    corpsJournal: modele.corps.includes("apprenant.motDePasse")
      ? rendre(modele.corps, { ...contexte, "apprenant.motDePasse": "[mot de passe masqué]" }).resultat
      : undefined,
    manquantes: [...new Set([...sujet.manquantes, ...corps.manquantes])],
  };
}
