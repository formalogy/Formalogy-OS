import "server-only";

import { motDePasseInitial, type Contexte } from "@/lib/emails/modeles";
import { formaterMontant } from "@/lib/factures";
import { LIBELLE_MODALITE, LIBELLE_PLATEFORME } from "@/lib/formations-libelles";
import { lireOrganisme } from "@/lib/organisme";
import { prisma } from "@/lib/prisma";
import { preparationAudit } from "@/lib/qualiopi-audit";
import { formaterPeriode } from "@/lib/sessions-libelles";

const dateDevis = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

function adresseApplication(): string {
  return (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
}


/// Plateforme e-learning de la session : une information qui manque reste
/// « À COMPLÉTER », ce qui bloque l'envoi plutôt que d'envoyer des accès faux.
function plateforme(
  code: keyof typeof LIBELLE_PLATEFORME | "FORMATEUR" | null | undefined,
  organisme: { adresseEforma: string | null; adresseMonParcours: string | null },
): Contexte {
  if (code === undefined) return {};
  if (code === null || code === "FORMATEUR") {
    const manque = "[À COMPLÉTER : plateforme e-learning, sur la fiche de la session]";
    return { "plateforme.nom": manque, "plateforme.adresse": manque };
  }
  const adresse = code === "EFORMA" ? organisme.adresseEforma : organisme.adresseMonParcours;
  return {
    "plateforme.nom": LIBELLE_PLATEFORME[code],
    "plateforme.adresse": adresse ?? `[À COMPLÉTER : site internet de ${LIBELLE_PLATEFORME[code]}, dans Paramètres → Organisme]`,
  };
}

/// Rassemble les valeurs des variables à partir des fiches concernées.
export async function construireContexte(ids: {
  learnerId?: string;
  trainerId?: string;
  sessionId?: string;
  companyId?: string;
  prospectId?: string;
  dossierId?: string;
  factureId?: string;
  /// Relance d'émargement : jours dont la feuille signée manque, en toutes lettres
  joursEmargement?: string;
  /// Émargement numérique : lien personnel de signature, séance à signer,
  /// signatures manquantes (relances)
  lienEmargement?: string;
  seanceEmargement?: string;
  manquantsEmargement?: string;
  lienQuestionnaire?: string;
  lienPositionnement?: string;
  lienFroid?: string;
  lienChaudFormateur?: string;
  lienFinanceur?: string;
  lienClient?: string;
  lienSatisfactionFormateur?: string;
  /// Relance de devis
  devisId?: string;
  /// Rappel avant l'audit : préparation Qualiopi (indicateurs à reprendre)
  qualiopi?: boolean;
  /// Synthèse hebdomadaire du formateur
  synthesePeriode?: string;
  syntheseSessions?: string;
}): Promise<Contexte> {
  const [organisme, apprenant, formateurDestinataire, session, entreprise, prospect, dossier, facture, devis, audit] = await Promise.all([
    lireOrganisme(),
    ids.learnerId ? prisma.learner.findUnique({ where: { id: ids.learnerId } }) : null,
    ids.trainerId ? prisma.trainer.findUnique({ where: { id: ids.trainerId } }) : null,
    ids.sessionId
      ? prisma.trainingSession.findUnique({
          where: { id: ids.sessionId },
          include: {
            formation: { select: { titre: true, dureeHeures: true } },
            company: { select: { raisonSociale: true } },
            trainer: { select: { prenom: true, nom: true } },
          },
        })
      : null,
    ids.companyId ? prisma.company.findUnique({ where: { id: ids.companyId } }) : null,
    ids.prospectId ? prisma.prospect.findUnique({ where: { id: ids.prospectId } }) : null,
    ids.dossierId ? prisma.dossierFinancement.findUnique({ where: { id: ids.dossierId } }) : null,
    ids.factureId ? prisma.facture.findUnique({ where: { id: ids.factureId } }) : null,
    ids.devisId ? prisma.devis.findUnique({ where: { id: ids.devisId } }) : null,
    ids.qualiopi ? preparationAudit() : null,
  ]);

  return {
    "organisme.nom": organisme.raisonSociale,
    "organisme.telephone": organisme.telephone,
    "organisme.email": organisme.email,
    ...plateforme(session ? session.plateforme : undefined, organisme),
    "formation.duree": session?.formation.dureeHeures ? `${Number(session.formation.dureeHeures).toLocaleString("fr-FR")} heures` : undefined,
    "apprenant.prenom": apprenant?.prenom,
    "apprenant.nom": apprenant?.nom,
    "apprenant.email": apprenant?.email,
    "apprenant.motDePasse": apprenant ? motDePasseInitial(apprenant.prenom, apprenant.nom) : undefined,
    "formateur.prenom": formateurDestinataire?.prenom,
    "formateur.nom": formateurDestinataire?.nom,
    "session.numero": session?.numero,
    "session.formation": session?.formation.titre,
    "session.dates": session ? formaterPeriode(session.dateDebut, session.dateFin) : undefined,
    "session.horaires": session?.horaires,
    "session.lieu": session?.lieu,
    "session.modalite": session ? LIBELLE_MODALITE[session.modalite] : undefined,
    "session.formateur": session?.trainer ? `${session.trainer.prenom} ${session.trainer.nom}` : undefined,
    "entreprise.nom": entreprise?.raisonSociale ?? session?.company?.raisonSociale,
    "prospect.nomComplet": prospect ? `${prospect.prenom} ${prospect.nom}` : undefined,
    "dossier.financeur": dossier?.financeurNom,
    "dossier.reference": dossier?.reference,
    "facture.numero": facture?.numero,
    "emargement.jours": ids.joursEmargement,
    "emargement.lien": ids.lienEmargement,
    "emargement.seance": ids.seanceEmargement,
    "emargement.manquants": ids.manquantsEmargement,
    "facture.montant": facture ? formaterMontant(facture.montantTTC) : undefined,
    "questionnaire.lien": ids.lienQuestionnaire,
    "questionnaire.lienPositionnement": ids.lienPositionnement,
    "questionnaire.lienFroid": ids.lienFroid,
    "questionnaire.lienChaudFormateur": ids.lienChaudFormateur,
    "questionnaire.lienFinanceur": ids.lienFinanceur,
    "questionnaire.lienClient": ids.lienClient,
    "questionnaire.lienSatisfactionFormateur": ids.lienSatisfactionFormateur,
    "devis.numero": devis?.numero,
    "devis.date": devis ? dateDevis.format(devis.date) : undefined,
    "devis.montant": devis ? `${formaterMontant(devis.montantHT)} HT` : undefined,
    "devis.objet": devis?.objet,
    "devis.client": devis?.clientNom,
    "devis.contact": devis ? (devis.contactNom ?? devis.clientNom) : undefined,
    "qualiopi.dateAudit": audit?.dateAuditTexte,
    "qualiopi.bilan": audit?.bilan,
    "qualiopi.aVerifier": audit?.aVerifier,
    "qualiopi.lien": audit ? `${adresseApplication()}/qualiopi` : undefined,
    "synthese.periode": ids.synthesePeriode,
    "synthese.sessions": ids.syntheseSessions,
  };
}
