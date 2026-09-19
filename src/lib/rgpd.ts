import "server-only";

import { prisma } from "@/lib/prisma";

/// Toutes les données personnelles détenues sur un apprenant, pour répondre à
/// une demande d'accès ou de portabilité (RGPD). Les fichiers eux-mêmes
/// (documents, PDF) ne sont pas inclus : seules leurs références le sont,
/// l'administrateur pouvant les transmettre séparément si besoin.
export async function exporterDonneesApprenant(learnerId: string) {
  const apprenant = await prisma.learner.findUnique({
    where: { id: learnerId },
    include: {
      company: { select: { raisonSociale: true } },
      inscriptions: {
        select: {
          session: {
            select: { numero: true, dateDebut: true, dateFin: true, formation: { select: { titre: true } } },
          },
        },
      },
      presences: { select: { jour: true, creneau: true, statut: true } },
      evaluations: { select: { resultat: true, commentaire: true, createdAt: true } },
      satisfactions: { select: { envoyeAt: true, reponduAt: true, noteGlobale: true, reponses: true } },
      documents: {
        where: { deletedAt: null },
        select: { nom: true, categorie: true, createdAt: true, type: { select: { nom: true } } },
      },
      factures: { select: { numero: true, objet: true, montantTTC: true, statut: true, dateEmission: true } },
      emails: { select: { sujet: true, statut: true, envoyeAt: true } },
    },
  });
  if (!apprenant) return null;

  return {
    exporteLe: new Date().toISOString(),
    identite: {
      prenom: apprenant.prenom,
      nom: apprenant.nom,
      dateNaissance: apprenant.dateNaissance,
      email: apprenant.email,
      telephone: apprenant.telephone,
      adresse: apprenant.adresse,
      codePostal: apprenant.codePostal,
      ville: apprenant.ville,
      entreprise: apprenant.company?.raisonSociale ?? null,
      financement: apprenant.financement,
      creeLe: apprenant.createdAt,
    },
    sessions: apprenant.inscriptions.map((i) => i.session),
    presences: apprenant.presences,
    evaluations: apprenant.evaluations,
    questionnairesSatisfaction: apprenant.satisfactions,
    documents: apprenant.documents,
    factures: apprenant.factures,
    emailsRecus: apprenant.emails,
  };
}

/// Exerce le droit à l'effacement : remplace l'identité et les coordonnées,
/// conserve les enregistrements liés sans donnée personnelle (obligations
/// comptables et de traçabilité Qualiopi). Un apprenant déjà anonymisé ne
/// peut pas l'être une seconde fois — il n'y a plus rien à effacer.
export async function anonymiserApprenant(learnerId: string) {
  const apprenant = await prisma.learner.findFirst({ where: { id: learnerId, anonymiseAt: null } });
  if (!apprenant) return { erreur: "Apprenant introuvable ou déjà anonymisé." };

  const reference = apprenant.id.slice(0, 8);
  await prisma.learner.update({
    where: { id: learnerId },
    data: {
      prenom: "Apprenant",
      nom: `anonymisé-${reference}`,
      dateNaissance: null,
      email: null,
      telephone: null,
      adresse: null,
      codePostal: null,
      ville: null,
      notes: null,
      henrriCustomerId: null,
      anonymiseAt: new Date(),
      deletedAt: new Date(),
    },
  });

  return {};
}
