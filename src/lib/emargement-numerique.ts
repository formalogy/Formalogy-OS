import "server-only";

import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import type { Creneau } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import QRCode from "qrcode";

import { adressePublique } from "@/lib/adresse-publique";
import { CRENEAUX, horairesDemiJournees, joursDeSession, LIBELLE_CRENEAU } from "@/lib/emargement";
import { sessionEmargementAutomatique } from "@/lib/emargement-acces";
import { enregistrerFeuilleSignee, joursSansFeuille, libelleJour } from "@/lib/emargement-feuilles";
import { genererFeuillesEmargement } from "@/lib/emargement-pdf";
import { lireOrganisme } from "@/lib/organisme";
import { tronquer } from "@/lib/pdf-outils";
import { prisma } from "@/lib/prisma";
import { empreinteJeton } from "@/lib/satisfaction";
import { aujourdhuiUTC } from "@/lib/sessions-libelles";

/// Émargement numérique (décision du client du 29/09/2026) : chaque
/// participant, apprenant ou formateur, signe chaque demi-journée depuis son
/// lien personnel ou son QR code. C'est une signature électronique simple :
/// sa valeur de preuve tient au lien personnel et aux éléments conservés avec
/// chaque signature (instant, appareil, adresse réseau, empreinte de l'image).

export type Participant = { learnerId: string } | { trainerId: string };

// ---------------------------------------------------------------------------
// Liens personnels
// ---------------------------------------------------------------------------


/// Le jeton d'un lien se recalcule à partir de son identifiant et d'un secret
/// du serveur : le même lien peut être affiché, copié ou mis en QR code
/// autant de fois que nécessaire, sans que la base en garde une copie
/// utilisable (seule son empreinte y figure).
function secret(): string {
  const valeur = process.env.BETTER_AUTH_SECRET;
  if (!valeur) throw new Error("BETTER_AUTH_SECRET est absente : les liens d'émargement ne peuvent pas être produits.");
  return valeur;
}

function jetonDuLien(lienId: string): string {
  return createHmac("sha256", secret()).update(`emargement:${lienId}`).digest("base64url");
}

const urlDuJeton = (jeton: string) => `${adressePublique()}/emargement/${jeton}`;

// ---------------------------------------------------------------------------
// QR codes par demi-journée (décision du client du 30/09/2026) : un apprenant
// ne signe qu'en scannant, sur place, le QR code que lui présente le
// formateur. Le QR code porte, en plus du lien personnel, un code propre à
// une demi-journée : le lien seul (reçu par email, gardé dans l'historique du
// téléphone) ne permet pas de signer, et le QR du matin ne vaut pas pour
// l'après-midi. Un absent ne peut donc pas émarger à distance.
// ---------------------------------------------------------------------------

const LETTRE_CRENEAU: Record<Creneau, string> = { MATIN: "M", APRES_MIDI: "A" };

function codeSeance(lienId: string, jour: Date, creneau: Creneau): string {
  return createHmac("sha256", secret())
    .update(`seance:${lienId}:${jour.toISOString().slice(0, 10)}:${creneau}`)
    .digest("base64url")
    .slice(0, 16);
}

/// Adresse contenue dans le QR code d'une demi-journée.
export function urlSeance(lienId: string, jour: Date, creneau: Creneau): string {
  return `${urlDuJeton(jetonDuLien(lienId))}?s=${jour.toISOString().slice(0, 10)}${LETTRE_CRENEAU[creneau]}.${codeSeance(lienId, jour, creneau)}`;
}

/// Demi-journée désignée par le code d'un QR code, s'il est authentique.
export function seanceDuCode(lienId: string, code: string | null | undefined): { jour: Date; creneau: Creneau } | null {
  const m = /^(\d{4}-\d{2}-\d{2})([MA])\.([A-Za-z0-9_-]{16})$/.exec(code ?? "");
  if (!m) return null;
  const jour = new Date(`${m[1]}T00:00:00.000Z`);
  if (Number.isNaN(jour.getTime())) return null;
  const creneau: Creneau = m[2] === "M" ? "MATIN" : "APRES_MIDI";
  const attendu = Buffer.from(codeSeance(lienId, jour, creneau));
  const recu = Buffer.from(m[3]);
  return attendu.length === recu.length && timingSafeEqual(attendu, recu) ? { jour, creneau } : null;
}

/// Lien personnel d'émargement d'un participant pour une session, créé au
/// premier besoin. Il reste le même toute la session.
export async function lienEmargement(sessionId: string, participant: Participant): Promise<{ id: string; url: string }> {
  const where =
    "learnerId" in participant
      ? { sessionId_learnerId: { sessionId, learnerId: participant.learnerId } }
      : { sessionId_trainerId: { sessionId, trainerId: participant.trainerId } };
  let lien = await prisma.lienEmargement.findUnique({ where });
  if (!lien) {
    const id = randomUUID();
    try {
      lien = await prisma.lienEmargement.create({ data: { id, sessionId, ...participant, jetonEmpreinte: empreinteJeton(jetonDuLien(id)) } });
    } catch (erreur) {
      // Deux demandes simultanées : l'autre a créé le lien, on le reprend.
      if (!(erreur instanceof Prisma.PrismaClientKnownRequestError && erreur.code === "P2002")) throw erreur;
      lien = await prisma.lienEmargement.findUniqueOrThrow({ where });
    }
  }
  const jeton = jetonDuLien(lien.id);
  // Secret du serveur changé depuis : l'empreinte suit, le lien reste valable
  // sous sa nouvelle forme.
  if (lien.jetonEmpreinte !== empreinteJeton(jeton)) {
    await prisma.lienEmargement.update({ where: { id: lien.id }, data: { jetonEmpreinte: empreinteJeton(jeton) } });
  }
  return { id: lien.id, url: urlDuJeton(jeton) };
}

// ---------------------------------------------------------------------------
// Heures de Paris et plages de signature
// ---------------------------------------------------------------------------

const FORMAT_HEURE_PARIS = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Paris" });
const FORMAT_DECALAGE = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Paris", timeZoneName: "longOffset" });

/// Minutes écoulées depuis minuit, heure de Paris.
export function minutesDeParis(instant = new Date()): number {
  const parties = FORMAT_HEURE_PARIS.formatToParts(instant);
  const heure = Number(parties.find((p) => p.type === "hour")?.value ?? 0) % 24;
  return heure * 60 + Number(parties.find((p) => p.type === "minute")?.value ?? 0);
}

/// Instant correspondant à une heure de Paris (en minutes) un jour de session.
export function instantDeParis(jour: Date, minutes: number): Date {
  const approche = new Date(jour.getTime() + minutes * 60000);
  const decalage = /GMT([+-])(\d{2}):(\d{2})/.exec(FORMAT_DECALAGE.formatToParts(approche).find((p) => p.type === "timeZoneName")?.value ?? "");
  const minutesDecalage = decalage ? (decalage[1] === "-" ? -1 : 1) * (Number(decalage[2]) * 60 + Number(decalage[3])) : 0;
  return new Date(approche.getTime() - minutesDecalage * 60000);
}

/// « 9h00–12h30 », « 9 h à 12 h 30 », « 09:00-12:30 » → [540, 750].
function heuresDuTexte(texte: string): number[] {
  return [...texte.matchAll(/(\d{1,2})\s*[hH:]\s*(\d{2})?/g)]
    .map((m) => ({ h: Number(m[1]), min: Number(m[2] ?? 0) }))
    .filter(({ h, min }) => h <= 23 && min <= 59)
    .map(({ h, min }) => h * 60 + min);
}

/// Sans horaire lisible : le matin s'ouvre à minuit, l'après-midi à midi ;
/// fins de demi-journée (moment des relances) à 12 h 30 et 17 h 30.
const OUVERTURE_PAR_DEFAUT: Record<Creneau, number> = { MATIN: 0, APRES_MIDI: 12 * 60 };
const FIN_PAR_DEFAUT: Record<Creneau, number> = { MATIN: 12 * 60 + 30, APRES_MIDI: 17 * 60 + 30 };
/// On peut signer un peu avant le début annoncé (arrivée en avance).
const AVANCE_MINUTES = 30;

/// Heures d'ouverture de la signature et de fin de chaque demi-journée (en
/// minutes, heure de Paris), lues dans les horaires de la session.
export function bornesDemiJournees(horaires: string | null): Record<Creneau, { ouverture: number; fin: number }> {
  const textes = horairesDemiJournees(horaires);
  // Un seul horaire pour la journée (« 9h–17h ») : son début vaut pour le
  // matin, sa fin pour l'après-midi.
  const journeeEntiere = textes.MATIN !== null && textes.MATIN === textes.APRES_MIDI;
  const matin = textes.MATIN ? heuresDuTexte(textes.MATIN) : [];
  const apresMidi = textes.APRES_MIDI ? heuresDuTexte(textes.APRES_MIDI) : [];
  const debutMatin = matin[0];
  const finMatin = !journeeEntiere && matin.length >= 2 ? matin[matin.length - 1] : undefined;
  const debutApresMidi = !journeeEntiere ? apresMidi[0] : undefined;
  const finApresMidi = apresMidi.length >= 2 ? apresMidi[apresMidi.length - 1] : undefined;
  return {
    MATIN: {
      ouverture: debutMatin !== undefined ? Math.max(0, debutMatin - AVANCE_MINUTES) : OUVERTURE_PAR_DEFAUT.MATIN,
      fin: finMatin ?? FIN_PAR_DEFAUT.MATIN,
    },
    APRES_MIDI: {
      ouverture: debutApresMidi !== undefined ? Math.max(0, debutApresMidi - AVANCE_MINUTES) : OUVERTURE_PAR_DEFAUT.APRES_MIDI,
      fin: finApresMidi ?? FIN_PAR_DEFAUT.APRES_MIDI,
    },
  };
}

export const heureLisible = (minutes: number) => `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;

/// Une séance se signe le jour même, à partir de son ouverture et jusqu'à
/// minuit : jamais à l'avance, jamais après coup.
export type OuvertureSeance = { etat: "ouverte" } | { etat: "a_venir"; ouverture: number | null } | { etat: "fermee" };

export function ouvertureSeance(horaires: string | null, jour: Date, creneau: Creneau, maintenant = new Date()): OuvertureSeance {
  const aujourdhui = aujourdhuiUTC();
  if (jour > aujourdhui) return { etat: "a_venir", ouverture: null };
  if (jour < aujourdhui) return { etat: "fermee" };
  const { ouverture } = bornesDemiJournees(horaires)[creneau];
  return minutesDeParis(maintenant) >= ouverture ? { etat: "ouverte" } : { etat: "a_venir", ouverture };
}

// ---------------------------------------------------------------------------
// Qui a signé, qui manque
// ---------------------------------------------------------------------------

export type Emargeur = { cle: string; learnerId?: string; trainerId?: string; nom: string; email: string | null };

type BilanDemiJournee = { attendus: Emargeur[]; manquants: Emargeur[]; signes: number };

/// Pour chaque jour demandé et chaque demi-journée : les participants
/// attendus (inscrits non signalés absents, et le formateur), et ceux dont la
/// signature manque.
export async function bilanSignatures(sessionId: string, jours: Date[]): Promise<Map<number, Record<Creneau, BilanDemiJournee>>> {
  const session = await prisma.trainingSession.findUnique({
    where: { id: sessionId },
    select: {
      trainer: { select: { id: true, prenom: true, nom: true, email: true, deletedAt: true } },
      inscriptions: {
        where: { learner: { deletedAt: null } },
        orderBy: [{ learner: { nom: "asc" } }, { learner: { prenom: "asc" } }],
        select: { learner: { select: { id: true, prenom: true, nom: true, email: true } } },
      },
      presences: { where: { jour: { in: jours }, statut: { not: "PRESENT" } }, select: { learnerId: true, jour: true, creneau: true } },
      signaturesEmargement: {
        where: { jour: { in: jours } },
        select: { jour: true, creneau: true, lien: { select: { learnerId: true, trainerId: true } } },
      },
    },
  });
  const bilan = new Map<number, Record<Creneau, BilanDemiJournee>>();
  if (!session) return bilan;

  const apprenants: Emargeur[] = session.inscriptions.map(({ learner: l }) => ({
    cle: `apprenant:${l.id}`,
    learnerId: l.id,
    nom: `${l.prenom} ${l.nom}`,
    email: l.email,
  }));
  const formateur: Emargeur | null =
    session.trainer && !session.trainer.deletedAt
      ? { cle: `formateur:${session.trainer.id}`, trainerId: session.trainer.id, nom: `${session.trainer.prenom} ${session.trainer.nom}`, email: session.trainer.email }
      : null;
  const cleDemiJournee = (jour: Date, creneau: Creneau) => `${jour.getTime()}|${creneau}`;
  const absents = new Set(session.presences.map((p) => `${cleDemiJournee(p.jour, p.creneau)}|apprenant:${p.learnerId}`));
  const signes = new Set(
    session.signaturesEmargement.map(
      (s) => `${cleDemiJournee(s.jour, s.creneau)}|${s.lien.learnerId ? `apprenant:${s.lien.learnerId}` : `formateur:${s.lien.trainerId}`}`,
    ),
  );

  for (const jour of jours) {
    const parCreneau = {} as Record<Creneau, BilanDemiJournee>;
    for (const creneau of CRENEAUX) {
      const cle = cleDemiJournee(jour, creneau);
      const attendus = [...apprenants.filter((a) => !absents.has(`${cle}|${a.cle}`)), ...(formateur ? [formateur] : [])];
      const manquants = attendus.filter((a) => !signes.has(`${cle}|${a.cle}`));
      parCreneau[creneau] = { attendus, manquants, signes: attendus.length - manquants.length };
    }
    bilan.set(jour.getTime(), parCreneau);
  }
  return bilan;
}

/// Signatures manquantes des jours donnés, en toutes lettres pour un email :
/// « lundi 28 septembre 2026, matin : Jean Dupont, vous-même ».
export async function texteSignaturesManquantes(sessionId: string, jours: Date[], formateurId?: string): Promise<string> {
  const bilan = await bilanSignatures(sessionId, jours);
  const lignes: string[] = [];
  for (const jour of jours) {
    for (const creneau of CRENEAUX) {
      const manquants = bilan.get(jour.getTime())?.[creneau].manquants ?? [];
      if (manquants.length === 0) continue;
      const noms = manquants.map((m) => (formateurId && m.trainerId === formateurId ? "vous-même" : m.nom));
      lignes.push(`- ${libelleJour(jour)}, ${LIBELLE_CRENEAU[creneau].toLowerCase()} : ${noms.join(", ")}`);
    }
  }
  return lignes.join("\n");
}

/// Range la feuille d'émargement des jours passés dont toutes les signatures
/// attendues sont arrivées (les absents signalés ne sont pas attendus). La
/// feuille porte les signatures et rejoint les documents de la session, comme
/// une feuille papier reçue : la relance du formateur s'arrête pour ce jour.
/// À appeler après une signature et après la saisie d'une absence.
export async function rangerFeuillesNumeriques(sessionId: string): Promise<number> {
  const session = await prisma.trainingSession.findFirst({
    where: { id: sessionId, deletedAt: null },
    select: { id: true, dateDebut: true, dateFin: true, statut: true },
  });
  if (!session || session.statut === "ANNULEE") return 0;
  const jours = await joursSansFeuille(session, aujourdhuiUTC());
  if (jours.length === 0) return 0;

  const bilan = await bilanSignatures(sessionId, jours);
  let rangees = 0;
  for (const jour of jours) {
    const b = bilan.get(jour.getTime());
    if (!b) continue;
    const complet = CRENEAUX.every((c) => b[c].manquants.length === 0);
    const auMoinsUne = CRENEAUX.some((c) => b[c].signes > 0);
    if (!complet || !auMoinsUne) continue;

    const emargement = await sessionEmargementAutomatique(sessionId);
    if (!emargement) return rangees;
    const pdf = await genererFeuillesEmargement(emargement, (await lireOrganisme()).raisonSociale, aujourdhuiUTC(), { jours: [jour] });
    try {
      const r = await enregistrerFeuilleSignee({
        sessionId,
        jour,
        fichiers: [{ nom: "emargement.pdf", typeMime: "application/pdf", octets: pdf }],
        origine: "NUMERIQUE",
      });
      if ("documentId" in r) rangees++;
    } catch (erreur) {
      // La dernière signature de deux participants au même instant : l'autre
      // appel a déjà rangé la feuille.
      if (!(erreur instanceof Prisma.PrismaClientKnownRequestError && erreur.code === "P2002")) throw erreur;
    }
  }
  return rangees;
}

// ---------------------------------------------------------------------------
// Page de signature
// ---------------------------------------------------------------------------

/// Participation correspondant à un lien, si elle est encore valable : la
/// session existe et n'est pas annulée, l'apprenant y est toujours inscrit,
/// le formateur l'anime toujours.
export async function participationParJeton(jeton: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(jeton)) return null;
  const lien = await prisma.lienEmargement.findUnique({
    where: { jetonEmpreinte: empreinteJeton(jeton) },
    select: {
      id: true,
      learnerId: true,
      trainerId: true,
      learner: { select: { prenom: true, nom: true, deletedAt: true } },
      trainer: { select: { prenom: true, nom: true, deletedAt: true } },
      session: {
        select: {
          id: true,
          numero: true,
          dateDebut: true,
          dateFin: true,
          horaires: true,
          lieu: true,
          statut: true,
          deletedAt: true,
          trainerId: true,
          formation: { select: { titre: true } },
        },
      },
      signatures: { select: { jour: true, creneau: true, signeAt: true } },
    },
  });
  if (!lien || lien.session.deletedAt || lien.session.statut === "ANNULEE") return null;

  let personne: { prenom: string; nom: string };
  let absences: { jour: Date; creneau: Creneau }[] = [];
  if (lien.learnerId && lien.learner) {
    if (lien.learner.deletedAt) return null;
    const inscription = await prisma.sessionLearner.findUnique({
      where: { sessionId_learnerId: { sessionId: lien.session.id, learnerId: lien.learnerId } },
      select: { id: true },
    });
    if (!inscription) return null;
    personne = lien.learner;
    absences = await prisma.presence.findMany({
      where: { sessionId: lien.session.id, learnerId: lien.learnerId, statut: { not: "PRESENT" } },
      select: { jour: true, creneau: true },
    });
  } else if (lien.trainerId && lien.trainer) {
    if (lien.trainer.deletedAt || lien.session.trainerId !== lien.trainerId) return null;
    personne = lien.trainer;
  } else {
    return null;
  }

  return { lienId: lien.id, formateur: Boolean(lien.trainerId), personne, session: lien.session, signatures: lien.signatures, absences };
}

export type EtatSeance =
  | { etat: "signee"; signeAt: Date }
  | { etat: "absent" }
  | { etat: "ouverte" }
  | { etat: "a_venir"; ouverture: number | null }
  | { etat: "non_signee" };

/// Séances d'une session pour un participant, dans l'ordre, avec leur état.
export function seancesDuParticipant(
  session: { dateDebut: Date; dateFin: Date; horaires: string | null },
  signatures: { jour: Date; creneau: Creneau; signeAt: Date }[],
  absences: { jour: Date; creneau: Creneau }[],
  maintenant = new Date(),
): { jour: Date; creneau: Creneau; etat: EtatSeance }[] {
  const meme = (a: { jour: Date; creneau: Creneau }, jour: Date, creneau: Creneau) => a.jour.getTime() === jour.getTime() && a.creneau === creneau;
  return joursDeSession(session.dateDebut, session.dateFin).flatMap((jour) =>
    CRENEAUX.map((creneau) => {
      const signature = signatures.find((s) => meme(s, jour, creneau));
      if (signature) return { jour, creneau, etat: { etat: "signee", signeAt: signature.signeAt } as EtatSeance };
      if (absences.some((a) => meme(a, jour, creneau))) return { jour, creneau, etat: { etat: "absent" } as EtatSeance };
      const ouverture = ouvertureSeance(session.horaires, jour, creneau, maintenant);
      return { jour, creneau, etat: (ouverture.etat === "fermee" ? { etat: "non_signee" } : ouverture) as EtatSeance };
    }),
  );
}

const SIGNATURE_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/// Une signature tracée pèse quelques kilo-octets ; au-delà, ce n'en est pas une.
const TAILLE_MAX_SIGNATURE = 300_000;

/// Enregistre la signature d'une demi-journée, avec ses éléments de preuve.
export async function enregistrerSignature(p: {
  jeton: string;
  jour: Date;
  creneau: Creneau;
  image: Uint8Array<ArrayBuffer>;
  ip: string | null;
  appareil: string | null;
  /// Code de demi-journée du QR code scanné (obligatoire pour un apprenant)
  seance?: string | null;
}): Promise<{ erreur?: string }> {
  const participation = await participationParJeton(p.jeton);
  if (!participation) return { erreur: "Ce lien n'est plus valable. Adressez-vous à votre formateur." };
  const { session } = participation;
  if (!participation.formateur) {
    const seance = seanceDuCode(participation.lienId, p.seance);
    if (!seance || seance.jour.getTime() !== p.jour.getTime() || seance.creneau !== p.creneau) {
      return { erreur: "Pour signer, scannez le QR code que vous présente votre formateur." };
    }
  }

  if (!joursDeSession(session.dateDebut, session.dateFin).some((j) => j.getTime() === p.jour.getTime())) {
    return { erreur: "Cette séance ne fait pas partie de la formation." };
  }
  const ouverture = ouvertureSeance(session.horaires, p.jour, p.creneau);
  if (ouverture.etat === "fermee") return { erreur: "Cette séance est passée : elle ne peut plus être signée." };
  if (ouverture.etat === "a_venir") {
    return { erreur: ouverture.ouverture !== null ? `Cette séance se signe à partir de ${heureLisible(ouverture.ouverture)}.` : "Cette séance n'a pas encore commencé." };
  }
  if (participation.absences.some((a) => a.jour.getTime() === p.jour.getTime() && a.creneau === p.creneau)) {
    return { erreur: "Une absence est signalée pour cette séance. Si vous êtes présent, prévenez votre formateur." };
  }

  const image = p.image;
  if (image.length < 100 || image.length > TAILLE_MAX_SIGNATURE || !SIGNATURE_PNG.every((octet, i) => image[i] === octet)) {
    return { erreur: "La signature n'a pas pu être lue : recommencez." };
  }
  try {
    await (await PDFDocument.create()).embedPng(image);
  } catch {
    return { erreur: "La signature n'a pas pu être lue : recommencez." };
  }

  try {
    await prisma.signatureEmargement.create({
      data: {
        lienId: participation.lienId,
        sessionId: session.id,
        jour: p.jour,
        creneau: p.creneau,
        image,
        empreinte: createHash("sha256").update(image).digest("hex"),
        ip: p.ip?.slice(0, 100) || null,
        appareil: p.appareil?.slice(0, 400) || null,
      },
    });
  } catch (erreur) {
    if (erreur instanceof Prisma.PrismaClientKnownRequestError && erreur.code === "P2002") return {};
    throw erreur;
  }

  // La feuille du jour se range dès que tout le monde a signé. Un échec ici ne
  // remet pas en cause la signature, déjà enregistrée : la feuille sera
  // rangée à la signature suivante ou au prochain réveil.
  await rangerFeuillesNumeriques(session.id).catch((erreur) => console.error("Feuille d'émargement numérique non rangée :", erreur));
  return {};
}

// ---------------------------------------------------------------------------
// QR codes à afficher en salle
// ---------------------------------------------------------------------------

/// Jour de formation dont on montre les QR codes : aujourd'hui si c'en est
/// un, sinon le prochain (préparation), sinon le dernier.
export function jourDesQrCodes(session: { dateDebut: Date; dateFin: Date }): Date | null {
  const jours = joursDeSession(session.dateDebut, session.dateFin);
  const aujourdhui = aujourdhuiUTC();
  return jours.find((j) => j.getTime() === aujourdhui.getTime()) ?? jours.find((j) => j > aujourdhui) ?? jours.at(-1) ?? null;
}

/// Demi-journée dont le QR code s'affiche à l'écran : la dernière ouverte
/// aujourd'hui, sinon la première du jour ; aucune hors des jours de formation.
function seanceDuMoment(session: { dateDebut: Date; dateFin: Date; horaires: string | null }): { jour: Date; creneau: Creneau } | null {
  const aujourdhui = aujourdhuiUTC();
  if (!joursDeSession(session.dateDebut, session.dateFin).some((j) => j.getTime() === aujourdhui.getTime())) return null;
  const ouvertes = CRENEAUX.filter((c) => ouvertureSeance(session.horaires, aujourdhui, c).etat === "ouverte");
  return { jour: aujourdhui, creneau: ouvertes.at(-1) ?? "MATIN" };
}

/// PDF des QR codes des apprenants pour une seule demi-journée (jamais deux
/// dans un même document, à la demande du client : chacun se tromperait) :
/// un QR code par apprenant, qui ne vaut que pour cette demi-journée. Joint
/// à l'email du matin (matin) puis à celui de la fin de matinée
/// (après-midi) ; sans précision, la demi-journée en cours.
export async function genererQrCodesEmargement(sessionId: string, creneauDemande?: Creneau): Promise<Uint8Array | null> {
  const session = await prisma.trainingSession.findFirst({
    where: { id: sessionId, deletedAt: null },
    select: {
      numero: true,
      dateDebut: true,
      dateFin: true,
      horaires: true,
      formation: { select: { titre: true } },
      inscriptions: {
        where: { learner: { deletedAt: null } },
        orderBy: [{ learner: { nom: "asc" } }, { learner: { prenom: "asc" } }],
        select: { learner: { select: { id: true, prenom: true, nom: true, company: { select: { raisonSociale: true } } } } },
      },
    },
  });
  const jour = session ? jourDesQrCodes(session) : null;
  if (!session || !jour || session.inscriptions.length === 0) return null;
  const moment = seanceDuMoment(session);
  const creneauQr: Creneau = creneauDemande ?? (moment && moment.jour.getTime() === jour.getTime() ? moment.creneau : "MATIN");
  const horaires = horairesDemiJournees(session.horaires);
  const liens = new Map(
    await Promise.all(session.inscriptions.map(async ({ learner }) => [learner.id, (await lienEmargement(sessionId, { learnerId: learner.id })).id] as const)),
  );

  const pdf = await PDFDocument.create();
  pdf.setTitle(`QR codes d'émargement ${session.numero}`);
  pdf.setCreator("Formalogy OS");
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const gras = await pdf.embedFont(StandardFonts.HelveticaBold);
  const organisme = (await lireOrganisme()).raisonSociale;
  const [L, H, MARGE] = [595.28, 841.89, 40];
  const NOIR = rgb(0.12, 0.14, 0.16);
  const GRIS = rgb(0.45, 0.47, 0.5);
  const COLONNES = 2;
  const LIGNES = 3;
  const largeurCase = (L - 2 * MARGE) / COLONNES;
  const hauteurCase = (H - 2 * MARGE - 70) / LIGNES;
  const COTE_QR = 140;

  for (const creneau of [creneauQr]) {
    let page = pdf.addPage([L, H]);
    for (const [rang, { learner }] of session.inscriptions.entries()) {
      const place = rang % (COLONNES * LIGNES);
      if (rang > 0 && place === 0) page = pdf.addPage([L, H]);
      if (place === 0) {
        const seance = `${LIBELLE_CRENEAU[creneau]} du ${libelleJour(jour)}`;
        page.drawText(tronquer(gras, `${organisme} · ${session.formation.titre} · session ${session.numero}`, 10, L - 2 * MARGE), { x: MARGE, y: H - MARGE, size: 10, font: gras, color: GRIS });
        page.drawText(tronquer(gras, `QR codes d'émargement — ${seance}`, 14, L - 2 * MARGE), { x: MARGE, y: H - MARGE - 22, size: 14, font: gras, color: NOIR });
        const consigne = "Chaque QR code est personnel et ne vaut que pour cette demi-journée : l'apprenant le scanne sur place pour signer.";
        page.drawText(tronquer(normal, horaires[creneau] ? `Horaire : ${horaires[creneau]} · ${consigne}` : consigne, 8.5, L - 2 * MARGE), {
          x: MARGE,
          y: H - MARGE - 40,
          size: 8.5,
          font: normal,
          color: GRIS,
        });
      }

      const colonne = place % COLONNES;
      const ligne = Math.floor(place / COLONNES);
      const x0 = MARGE + colonne * largeurCase;
      const haut = H - MARGE - 70 - ligne * hauteurCase;
      page.drawRectangle({ x: x0 + 6, y: haut - hauteurCase + 6, width: largeurCase - 12, height: hauteurCase - 12, borderColor: rgb(0.8, 0.82, 0.85), borderWidth: 0.6 });
      const nom = `${learner.prenom} ${learner.nom.toUpperCase()}`;
      page.drawText(tronquer(gras, nom, 12, largeurCase - 32), { x: x0 + 16, y: haut - 28, size: 12, font: gras, color: NOIR });
      if (learner.company) {
        page.drawText(tronquer(normal, learner.company.raisonSociale, 9, largeurCase - 32), { x: x0 + 16, y: haut - 42, size: 9, font: normal, color: GRIS });
      }

      // QR code dessiné module par module : net à toutes les tailles d'impression.
      const modules = QRCode.create(urlSeance(liens.get(learner.id)!, jour, creneau), { errorCorrectionLevel: "M" }).modules;
      const cote = COTE_QR / modules.size;
      const qx = x0 + (largeurCase - COTE_QR) / 2;
      const qy = haut - 56 - COTE_QR;
      for (let r = 0; r < modules.size; r++) {
        for (let c = 0; c < modules.size; c++) {
          if (modules.get(r, c)) page.drawRectangle({ x: qx + c * cote, y: qy + (modules.size - 1 - r) * cote, width: cote, height: cote, color: NOIR });
        }
      }
      const legende = `Scannez pour signer · ${LIBELLE_CRENEAU[creneau].toLowerCase()}`;
      page.drawText(legende, { x: x0 + (largeurCase - normal.widthOfTextAtSize(legende, 9)) / 2, y: qy - 14, size: 9, font: normal, color: GRIS });
    }
  }
  return pdf.save();
}

// ---------------------------------------------------------------------------
// Suivi dans la session
// ---------------------------------------------------------------------------

export type SeanceSuivie = {
  cle: string;
  libelle: string;
  etat: EtatSeance["etat"];
  /// Heure de la signature, ou heure d'ouverture d'une séance du jour à venir
  heure?: string;
  signatureId?: string;
};

export type ParticipantSuivi = {
  cle: string;
  nom: string;
  detail: string | null;
  formateur: boolean;
  /// Lien personnel à copier : celui du formateur seulement (un apprenant ne
  /// signe qu'en scannant son QR code sur place)
  url: string | null;
  /// QR codes à présenter : pour un apprenant, ceux des demi-journées du jour
  /// (celle en cours marquée) ; pour le formateur, son lien
  qrs: { url: string; libelle: string; actuel: boolean }[];
  seances: SeanceSuivie[];
};

const jourCourt = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const heureSignature = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

/// Pour l'écran d'émargement de la session : chaque participant (apprenants,
/// puis formateur), son lien personnel et l'état de chacune de ses séances.
export async function suiviSignatures(session: {
  id: string;
  dateDebut: Date;
  dateFin: Date;
  horaires: string | null;
  trainerId: string | null;
  trainer: { prenom: string; nom: string } | null;
  inscriptions: { learner: { id: string; prenom: string; nom: string; company: { raisonSociale: string } | null } }[];
  presences: { learnerId: string; jour: Date; creneau: Creneau; statut: string }[];
}): Promise<ParticipantSuivi[]> {
  const signatures = await prisma.signatureEmargement.findMany({
    where: { sessionId: session.id },
    select: { id: true, jour: true, creneau: true, signeAt: true, lien: { select: { learnerId: true, trainerId: true } } },
  });
  const personnes: { participant: Participant; nom: string; detail: string | null }[] = [
    ...session.inscriptions.map(({ learner: l }) => ({
      participant: { learnerId: l.id },
      nom: `${l.prenom} ${l.nom}`,
      detail: l.company?.raisonSociale ?? null,
    })),
    ...(session.trainerId && session.trainer
      ? [{ participant: { trainerId: session.trainerId }, nom: `${session.trainer.prenom} ${session.trainer.nom}`, detail: "Formateur" }]
      : []),
  ];

  const moment = seanceDuMoment(session);
  return Promise.all(
    personnes.map(async ({ participant, nom, detail }) => {
      const lien = await lienEmargement(session.id, participant);
      const apprenant = "learnerId" in participant;
      const qrs = !apprenant
        ? [{ url: lien.url, libelle: "Lien personnel du formateur", actuel: true }]
        : moment
          ? CRENEAUX.map((creneau) => ({
              url: urlSeance(lien.id, moment.jour, creneau),
              libelle: LIBELLE_CRENEAU[creneau],
              actuel: creneau === moment.creneau,
            }))
          : [];
      const siennes = signatures.filter((s) =>
        "learnerId" in participant ? s.lien.learnerId === participant.learnerId : s.lien.trainerId === participant.trainerId,
      );
      const absences = "learnerId" in participant ? session.presences.filter((p) => p.learnerId === participant.learnerId && p.statut !== "PRESENT") : [];
      return {
        cle: "learnerId" in participant ? `apprenant:${participant.learnerId}` : `formateur:${participant.trainerId}`,
        nom,
        detail,
        formateur: !apprenant,
        url: apprenant ? null : lien.url,
        qrs,
        seances: seancesDuParticipant(session, siennes, absences).map(({ jour, creneau, etat }) => {
          const signature = siennes.find((s) => s.jour.getTime() === jour.getTime() && s.creneau === creneau);
          return {
            cle: `${jour.toISOString().slice(0, 10)}-${creneau}`,
            libelle: `${jourCourt.format(jour)} · ${LIBELLE_CRENEAU[creneau].toLowerCase()}`,
            etat: etat.etat,
            heure:
              etat.etat === "signee"
                ? heureSignature.format(etat.signeAt)
                : etat.etat === "a_venir" && etat.ouverture !== null
                  ? heureLisible(etat.ouverture)
                  : undefined,
            signatureId: signature?.id,
          };
        }),
      };
    }),
  );
}
