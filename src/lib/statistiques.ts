import "server-only";

import type { ResultatAcquis, StatutFacture, StatutPresence, StatutSession } from "@prisma/client";

import { enCentimes } from "@/lib/factures";
import { prisma } from "@/lib/prisma";
import { notesDetaillees } from "@/lib/questionnaires-modeles";

/// Sessions retenues dans les statistiques : ni brouillon (rien n'est encore
/// décidé) ni annulée (elle n'a pas eu lieu).
const SESSIONS_COMPTEES = { deletedAt: null, statut: { notIn: ["BROUILLON", "ANNULEE"] as StatutSession[] } };

/// Factures retenues dans le chiffre d'affaires : celles qui portent un
/// numéro Henrri. Une facture « à émettre » n'est pas encore du chiffre
/// d'affaires, une facture annulée n'en est plus.
const FACTURES_COMPTEES = { statut: { in: ["EMISE", "PAYEE"] as StatutFacture[] } };

export type Statistiques = Awaited<ReturnType<typeof calculerStatistiques>>;

function bornesAnnee(annee: number) {
  return { debut: new Date(Date.UTC(annee, 0, 1)), fin: new Date(Date.UTC(annee + 1, 0, 1)) };
}

/// Années proposées dans le sélecteur : celles où il s'est passé quelque
/// chose, plus l'année en cours pour qu'elle soit toujours consultable.
export async function anneesDisponibles(): Promise<number[]> {
  const [premiereSession, premiereFacture] = await Promise.all([
    prisma.trainingSession.findFirst({ where: SESSIONS_COMPTEES, orderBy: { dateDebut: "asc" }, select: { dateDebut: true } }),
    prisma.facture.findFirst({ where: { ...FACTURES_COMPTEES, dateEmission: { not: null } }, orderBy: { dateEmission: "asc" }, select: { dateEmission: true } }),
  ]);

  const enCours = new Date().getUTCFullYear();
  const debuts = [premiereSession?.dateDebut, premiereFacture?.dateEmission]
    .filter((d): d is Date => d !== null && d !== undefined)
    .map((d) => d.getUTCFullYear());
  const premiere = Math.min(enCours, ...debuts);

  const annees: number[] = [];
  for (let a = enCours; a >= premiere; a--) annees.push(a);
  return annees;
}

export async function calculerStatistiques(annee: number) {
  const { debut, fin } = bornesAnnee(annee);
  const periode = { gte: debut, lt: fin };

  const [factures, paiements, sessions, presences, satisfactions, evaluations] = await Promise.all([
    prisma.facture.findMany({
      where: { ...FACTURES_COMPTEES, dateEmission: periode },
      select: { id: true, montantHT: true, montantTTC: true, dateEmission: true, paiements: { select: { montant: true } } },
    }),
    prisma.paiement.findMany({
      where: { date: periode, facture: { statut: { not: "ANNULEE" } } },
      select: { montant: true },
    }),
    prisma.trainingSession.findMany({
      where: { ...SESSIONS_COMPTEES, dateDebut: periode },
      select: {
        id: true,
        placesMax: true,
        formation: { select: { dureeHeures: true } },
        inscriptions: { select: { learnerId: true } },
      },
    }),
    prisma.presence.groupBy({
      by: ["statut"],
      where: { session: { ...SESSIONS_COMPTEES, dateDebut: periode } },
      _count: { _all: true },
    }),
    prisma.questionnaireSatisfaction.findMany({
      where: { session: { ...SESSIONS_COMPTEES, dateDebut: periode } },
      select: { envoyeAt: true, reponduAt: true, noteGlobale: true, reponses: true, questions: true },
      // Les plus récentes d'abord : voir notesDetaillees.
      orderBy: { reponduAt: { sort: "desc", nulls: "last" } },
    }),
    prisma.evaluationAcquis.groupBy({
      by: ["resultat"],
      where: { session: { ...SESSIONS_COMPTEES, dateDebut: periode } },
      _count: { _all: true },
    }),
  ]);

  return {
    annee,
    chiffreAffaires: chiffreAffaires(factures, paiements),
    activite: activite(sessions),
    assiduite: assiduite(presences),
    satisfaction: satisfaction(satisfactions),
    resultats: resultats(evaluations),
  };
}

// ---------------------------------------------------------------- Chiffre d'affaires

type FactureCalcul = { montantHT: unknown; montantTTC: unknown; dateEmission: Date | null; paiements: { montant: unknown }[] };

/// Tous les montants en centimes entiers : jamais d'arithmétique sur des
/// nombres à virgule flottante pour de l'argent.
function chiffreAffaires(factures: FactureCalcul[], paiements: { montant: unknown }[]) {
  const parMois = Array.from({ length: 12 }, () => 0);
  let factureHT = 0;
  let resteDu = 0;

  for (const f of factures) {
    const ht = enCentimes(f.montantHT);
    factureHT += ht;
    if (f.dateEmission) parMois[f.dateEmission.getUTCMonth()] += ht;
    const regle = f.paiements.reduce((total, p) => total + enCentimes(p.montant), 0);
    resteDu += Math.max(0, enCentimes(f.montantTTC) - regle);
  }

  const encaisse = paiements.reduce((total, p) => total + enCentimes(p.montant), 0);
  return { factureHT, encaisse, resteDu, parMois, nombreFactures: factures.length };
}

// ---------------------------------------------------------------- Activité

type SessionCalcul = { placesMax: number | null; formation: { dureeHeures: unknown }; inscriptions: { learnerId: string }[] };

function activite(sessions: SessionCalcul[]) {
  const apprenants = new Set<string>();
  let heures = 0;
  let heuresStagiaires = 0;
  let places = 0;
  let placesOccupees = 0;

  for (const s of sessions) {
    for (const i of s.inscriptions) apprenants.add(i.learnerId);
    const duree = s.formation.dureeHeures ? Number(s.formation.dureeHeures) : 0;
    heures += duree;
    heuresStagiaires += duree * s.inscriptions.length;
    // Le taux de remplissage n'a de sens que pour les sessions dont le
    // nombre de places est renseigné.
    if (s.placesMax && s.placesMax > 0) {
      places += s.placesMax;
      placesOccupees += Math.min(s.inscriptions.length, s.placesMax);
    }
  }

  return {
    nombreSessions: sessions.length,
    nombreApprenants: apprenants.size,
    heures,
    heuresStagiaires,
    places,
    placesOccupees,
    /// null quand aucune session de l'année n'indique son nombre de places.
    tauxRemplissage: places > 0 ? placesOccupees / places : null,
  };
}

// ---------------------------------------------------------------- Assiduité

function assiduite(lignes: { statut: StatutPresence; _count: { _all: number } }[]) {
  const parStatut = { PRESENT: 0, ABSENT_JUSTIFIE: 0, ABSENT: 0 } satisfies Record<StatutPresence, number>;
  for (const l of lignes) parStatut[l.statut] = l._count._all;
  const total = parStatut.PRESENT + parStatut.ABSENT_JUSTIFIE + parStatut.ABSENT;
  return { parStatut, total, taux: total > 0 ? parStatut.PRESENT / total : null };
}

// ---------------------------------------------------------------- Satisfaction

type SatisfactionCalcul = { envoyeAt: Date | null; reponduAt: Date | null; noteGlobale: number | null; reponses: unknown; questions: unknown };

function satisfaction(questionnaires: SatisfactionCalcul[]) {
  const envoyes = questionnaires.filter((q) => q.envoyeAt !== null).length;
  const repondus = questionnaires.filter((q) => q.reponduAt !== null);

  const notes = repondus.map((q) => q.noteGlobale).filter((n): n is number => typeof n === "number");
  const moyenne = notes.length > 0 ? notes.reduce((t, n) => t + n, 0) / notes.length : null;

  // Une moyenne par note détaillée, sous l'intitulé le plus récent : une
  // question reformulée garde son historique, une question retirée du
  // questionnaire reste visible tant que l'année compte des réponses.
  const parQuestion = notesDetaillees(repondus.map((q) => q.questions), "SATISFACTION").map((question) => {
    const valeurs = repondus
      .map((q) => (q.reponses as Record<string, unknown> | null)?.[question.id])
      .filter((n): n is number => typeof n === "number");
    return {
      cle: question.id,
      libelle: question.libelle,
      moyenne: valeurs.length > 0 ? valeurs.reduce((t, n) => t + n, 0) / valeurs.length : null,
      nombre: valeurs.length,
    };
  });

  return { envoyes, repondus: repondus.length, moyenne, parQuestion, tauxReponse: envoyes > 0 ? repondus.length / envoyes : null };
}

// ---------------------------------------------------------------- Résultats des évaluations

function resultats(lignes: { resultat: ResultatAcquis; _count: { _all: number } }[]) {
  const parResultat = { ACQUIS: 0, PARTIELLEMENT_ACQUIS: 0, NON_ACQUIS: 0 } satisfies Record<ResultatAcquis, number>;
  for (const l of lignes) parResultat[l.resultat] = l._count._all;
  const total = parResultat.ACQUIS + parResultat.PARTIELLEMENT_ACQUIS + parResultat.NON_ACQUIS;
  return { parResultat, total, taux: total > 0 ? parResultat.ACQUIS / total : null };
}
