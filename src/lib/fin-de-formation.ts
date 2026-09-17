import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { genererAttestation, genererCertificatRealisation, type DonneesAttestation } from "@/lib/attestations-pdf";
import { CRENEAUX, clePresence, joursDeSession } from "@/lib/emargement";
import { LIBELLE_MODALITE } from "@/lib/formations-libelles";
import { journaliser } from "@/lib/journal";
import { lireOrganisme, manquesOrganisme } from "@/lib/organisme";
import { prisma } from "@/lib/prisma";
import { aujourdhuiUTC } from "@/lib/sessions-libelles";
import { stockage } from "@/lib/stockage";

/// Heures suivies : durée de la formation au prorata des demi-journées où
/// l'apprenant était présent, arrondie à la demi-heure.
export function heuresSuivies(heuresPrevues: number, demiJourneesTotal: number, demiJourneesPresent: number): number {
  if (demiJourneesTotal === 0) return 0;
  return Math.round((heuresPrevues * demiJourneesPresent * 2) / demiJourneesTotal) / 2;
}

export async function chargerFinDeFormation(sessionId: string) {
  return prisma.trainingSession.findFirst({
    where: { id: sessionId, deletedAt: null },
    select: {
      id: true,
      numero: true,
      statut: true,
      dateDebut: true,
      dateFin: true,
      lieu: true,
      modalite: true,
      formation: { select: { titre: true, objectifs: true, dureeHeures: true } },
      company: { select: { raisonSociale: true } },
      trainer: { select: { prenom: true, nom: true } },
      inscriptions: {
        where: { learner: { deletedAt: null } },
        orderBy: [{ learner: { nom: "asc" } }, { learner: { prenom: "asc" } }],
        select: { learner: { select: { id: true, prenom: true, nom: true, companyId: true, company: { select: { raisonSociale: true } } } } },
      },
      presences: { select: { learnerId: true, jour: true, creneau: true, statut: true } },
      evaluations: { select: { learnerId: true, resultat: true, commentaire: true } },
      documents: {
        where: { deletedAt: null, type: { code: { in: ["ATTESTATION", "CERTIFICAT"] } } },
        select: { id: true, learnerId: true, type: { select: { code: true } } },
      },
    },
  });
}

type Session = NonNullable<Awaited<ReturnType<typeof chargerFinDeFormation>>>;

export type EtatApprenant = {
  learnerId: string;
  nom: string;
  entreprise: string | null;
  demiJourneesPresent: number;
  presencesManquantes: number;
  heures: number | null;
  evaluation: Session["evaluations"][number] | null;
  attestationId: string | null;
  certificatId: string | null;
  /// Ce qui empêche de générer ses documents
  blocages: string[];
};

/// Bilan de fin de formation : pour chaque apprenant, ce qui est prêt et ce
/// qui manque avant de pouvoir établir ses documents.
export function bilanFinDeFormation(session: Session, manquesOrga: string[]) {
  const jours = joursDeSession(session.dateDebut, session.dateFin);
  const total = jours.length * CRENEAUX.length;
  const presences = new Map(session.presences.map((p) => [clePresence(p.learnerId, p.jour, p.creneau), p.statut]));
  const heuresPrevues = session.formation.dureeHeures ? Number(session.formation.dureeHeures) : null;

  const blocagesSession: string[] = [];
  if (session.dateFin > aujourdhuiUTC()) blocagesSession.push("la session n'est pas terminée");
  if (session.statut === "ANNULEE") blocagesSession.push("la session est annulée");
  if (heuresPrevues === null) blocagesSession.push("la durée en heures de la formation n'est pas renseignée");
  if (manquesOrga.length) blocagesSession.push(`informations de l'organisme à compléter (${manquesOrga.join(", ")})`);

  const apprenants: EtatApprenant[] = session.inscriptions.map(({ learner }) => {
    let present = 0;
    let manquantes = 0;
    for (const jour of jours)
      for (const creneau of CRENEAUX) {
        const statut = presences.get(clePresence(learner.id, jour, creneau));
        if (!statut) manquantes++;
        else if (statut === "PRESENT") present++;
      }
    const evaluation = session.evaluations.find((e) => e.learnerId === learner.id) ?? null;
    const doc = (code: string) => session.documents.find((d) => d.learnerId === learner.id && d.type?.code === code)?.id ?? null;
    const blocages: string[] = [];
    if (manquantes > 0) blocages.push(`${manquantes} demi-journée(s) sans présence saisie`);
    if (!evaluation) blocages.push("évaluation des acquis non saisie");
    return {
      learnerId: learner.id,
      nom: `${learner.prenom} ${learner.nom}`,
      entreprise: learner.company?.raisonSociale ?? null,
      demiJourneesPresent: present,
      presencesManquantes: manquantes,
      heures: heuresPrevues === null ? null : heuresSuivies(heuresPrevues, total, present),
      evaluation,
      attestationId: doc("ATTESTATION"),
      certificatId: doc("CERTIFICAT"),
      blocages,
    };
  });

  return { heuresPrevues, demiJourneesTotal: total, blocagesSession, apprenants };
}

/// Range un document généré : nouveau document s'il n'existe pas encore,
/// nouvelle version si son contenu a changé, rien s'il est identique.
async function enregistrerDocumentGenere(p: {
  typeCode: "ATTESTATION" | "CERTIFICAT";
  nom: string;
  nomFichier: string;
  octets: Uint8Array;
  learnerId: string;
  sessionId: string;
  companyId: string | null;
  userId: string;
}): Promise<"cree" | "nouvelle_version" | "inchange"> {
  const empreinte = createHash("sha256").update(p.octets).digest("hex");
  const type = await prisma.documentType.findUniqueOrThrow({ where: { code: p.typeCode } });
  const existant = await prisma.document.findFirst({
    where: { deletedAt: null, typeId: type.id, learnerId: p.learnerId, sessionId: p.sessionId },
    include: { versions: { orderBy: { numero: "desc" }, take: 1 } },
  });
  if (existant?.versions[0]?.empreinte === empreinte) return "inchange";

  const documentId = existant?.id ?? randomUUID();
  const numero = (existant?.versions[0]?.numero ?? 0) + 1;
  const chemin = `${documentId}/v${numero}-${randomUUID()}.pdf`;
  await stockage().deposer(chemin, p.octets, "application/pdf");

  const version = {
    numero,
    cheminStockage: chemin,
    nomFichier: p.nomFichier,
    typeMime: "application/pdf",
    taille: p.octets.byteLength,
    empreinte,
    commentaire: existant ? "Régénéré après modification des données" : "Généré par Formalogy OS",
    createdById: p.userId,
  };

  try {
    if (existant) {
      await prisma.documentVersion.create({ data: { ...version, documentId } });
      await prisma.document.update({ where: { id: documentId }, data: { updatedAt: new Date() } });
      return "nouvelle_version";
    }
    await prisma.document.create({
      data: {
        id: documentId,
        nom: p.nom,
        typeId: type.id,
        categorie: "APPRENANT",
        statut: "VALIDE",
        learnerId: p.learnerId,
        sessionId: p.sessionId,
        companyId: p.companyId,
        createdById: p.userId,
        versions: { create: version },
      },
    });
    return "cree";
  } catch (erreur) {
    await stockage().supprimer([chemin]).catch(() => undefined);
    throw erreur;
  }
}

const nomFichier = (prefixe: string, numero: string, nom: string) =>
  `${prefixe}-${numero}-${nom}`.normalize("NFD").replace(/\p{M}/gu, "").replace(/[^A-Za-z0-9-]+/g, "-").replace(/-+/g, "-") + ".pdf";

/// Génère l'attestation de fin de formation et le certificat de réalisation
/// des apprenants prêts. Les apprenants incomplets sont ignorés et signalés.
export async function genererDocumentsFinDeFormation(sessionId: string, userId: string) {
  const [session, organisme] = await Promise.all([chargerFinDeFormation(sessionId), lireOrganisme()]);
  if (!session) return { erreur: "Session introuvable." };

  const bilan = bilanFinDeFormation(session, manquesOrganisme(organisme));
  if (bilan.blocagesSession.length) return { erreur: `Impossible pour le moment : ${bilan.blocagesSession.join(" ; ")}.` };

  const resultats = { crees: 0, misAJour: 0, inchanges: 0, ignores: [] as string[] };
  for (const a of bilan.apprenants) {
    if (a.blocages.length || !a.evaluation || a.heures === null) {
      resultats.ignores.push(`${a.nom} (${a.blocages.join(", ")})`);
      continue;
    }
    const inscription = session.inscriptions.find((i) => i.learner.id === a.learnerId)!.learner;
    const donnees: DonneesAttestation = {
      organisme,
      apprenant: { prenom: inscription.prenom, nom: inscription.nom },
      entreprise: a.entreprise,
      formation: { titre: session.formation.titre, objectifs: session.formation.objectifs },
      session: {
        numero: session.numero,
        dateDebut: session.dateDebut,
        dateFin: session.dateFin,
        lieu: session.lieu,
        modaliteLibelle: LIBELLE_MODALITE[session.modalite],
      },
      heuresPrevues: bilan.heuresPrevues!,
      heuresRealisees: a.heures,
      resultat: a.evaluation.resultat,
      commentaire: a.evaluation.commentaire,
      etabliLe: session.dateFin,
    };

    for (const [typeCode, generer, libelle, prefixe] of [
      ["ATTESTATION", genererAttestation, "Attestation de fin de formation", "Attestation"],
      ["CERTIFICAT", genererCertificatRealisation, "Certificat de réalisation", "Certificat-realisation"],
    ] as const) {
      const r = await enregistrerDocumentGenere({
        typeCode,
        nom: `${libelle} — ${a.nom} (${session.numero})`,
        nomFichier: nomFichier(prefixe, session.numero, a.nom),
        octets: await generer(donnees),
        learnerId: a.learnerId,
        sessionId: session.id,
        companyId: inscription.companyId,
        userId,
      });
      if (r === "cree") resultats.crees++;
      else if (r === "nouvelle_version") resultats.misAJour++;
      else resultats.inchanges++;
    }
  }

  if (resultats.crees || resultats.misAJour) {
    await journaliser({
      action: "certificates.generated",
      summary: `Attestations et certificats de la session ${session.numero} : ${resultats.crees} créé(s), ${resultats.misAJour} mis à jour`,
      entityType: "TrainingSession",
      entityId: session.id,
      userId,
    });
  }
  return { resultats };
}
