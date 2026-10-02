import "server-only";

import { Prisma } from "@prisma/client";

import { LIBELLE_FINANCEMENT } from "@/lib/apprenants-libelles";
import { LIBELLE_MODALITE } from "@/lib/formations-libelles";
import { prisma } from "@/lib/prisma";

/// Connexions externes (demande du client du 02/10/2026) : à chaque
/// événement choisi, l'application envoie une ligne de données à l'adresse
/// « webhook » d'un scénario Make, qui peut l'ajouter dans un tableur Excel.
/// Envoi seulement : rien n'entre dans l'application par ce chemin.

export const EVENEMENTS_WEBHOOK = {
  APPRENANT_CREE: "Stagiaire créé",
  INSCRIPTION_SESSION: "Inscription à une session",
  SESSION_TERMINEE: "Session terminée",
  FACTURE_EMISE: "Facture émise",
} as const;
export type CodeEvenementWebhook = keyof typeof EVENEMENTS_WEBHOOK;

export type EvenementWebhook =
  | { type: "APPRENANT_CREE"; learnerId: string }
  | { type: "INSCRIPTION_SESSION"; sessionId: string; learnerId: string }
  | { type: "SESSION_TERMINEE"; sessionId: string }
  | { type: "FACTURE_EMISE"; factureId: string };

const DELAI_MS = 10_000;

/// Adresse acceptée : https, vers un nom de domaine public (pas une adresse
/// du réseau local, ni la machine elle-même). Renvoie un message d'erreur.
export function adresseWebhookInvalide(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return "Adresse invalide : collez l'adresse complète donnée par Make (https://hook…).";
  }
  if (u.protocol !== "https:") return "L'adresse doit commencer par https://.";
  const hote = u.hostname.toLowerCase();
  if (hote === "localhost" || hote.endsWith(".localhost") || hote.endsWith(".local") || /^[\d.]+$/.test(hote) || hote.includes(":")) {
    return "L'adresse doit être celle d'un service en ligne (Make), pas une adresse locale.";
  }
  return null;
}

const jour = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");
const montant = (v: Prisma.Decimal | number | null | undefined) => (v === null || v === undefined ? "" : Number(v));

/// Données d'une session, à plat (une colonne par information).
async function colonnesSession(sessionId: string) {
  const s = await prisma.trainingSession.findUnique({
    where: { id: sessionId },
    select: {
      numero: true, dateDebut: true, dateFin: true, lieu: true, modalite: true, statut: true,
      formation: { select: { titre: true, reference: true, dureeHeures: true } },
      trainer: { select: { prenom: true, nom: true } },
      company: { select: { raisonSociale: true } },
      _count: { select: { inscriptions: true } },
    },
  });
  if (!s) return null;
  return {
    session_numero: s.numero,
    formation: s.formation.titre,
    formation_reference: s.formation.reference,
    duree_heures: montant(s.formation.dureeHeures),
    date_debut: jour(s.dateDebut),
    date_fin: jour(s.dateFin),
    modalite: LIBELLE_MODALITE[s.modalite],
    lieu: s.lieu ?? "",
    formateur: s.trainer ? `${s.trainer.prenom} ${s.trainer.nom}` : "",
    entreprise_cliente: s.company?.raisonSociale ?? "",
    nombre_inscrits: s._count.inscriptions,
  };
}

async function colonnesStagiaire(learnerId: string) {
  const a = await prisma.learner.findUnique({
    where: { id: learnerId },
    select: { prenom: true, nom: true, email: true, telephone: true, ville: true, financement: true, numeroDossierCpf: true, company: { select: { raisonSociale: true } } },
  });
  if (!a) return null;
  return {
    stagiaire_prenom: a.prenom,
    stagiaire_nom: a.nom,
    stagiaire_email: a.email ?? "",
    stagiaire_telephone: a.telephone ?? "",
    stagiaire_ville: a.ville ?? "",
    stagiaire_entreprise: a.company?.raisonSociale ?? "",
    financement: LIBELLE_FINANCEMENT[a.financement],
    dossier_cpf: a.numeroDossierCpf ?? "",
  };
}

/// La ligne envoyée pour un événement, et sa clé d'unicité.
async function preparer(e: EvenementWebhook): Promise<{ cle: string; resume: string; donnees: Record<string, string | number> } | null> {
  switch (e.type) {
    case "APPRENANT_CREE": {
      const st = await colonnesStagiaire(e.learnerId);
      return st && { cle: `${e.type}:${e.learnerId}`, resume: `${st.stagiaire_prenom} ${st.stagiaire_nom}`, donnees: st };
    }
    case "INSCRIPTION_SESSION": {
      const [st, se, insc] = await Promise.all([
        colonnesStagiaire(e.learnerId),
        colonnesSession(e.sessionId),
        prisma.sessionLearner.findUnique({ where: { sessionId_learnerId: { sessionId: e.sessionId, learnerId: e.learnerId } }, select: { prixHT: true, facturerA: true } }),
      ]);
      if (!st || !se) return null;
      return {
        cle: `${e.type}:${e.sessionId}:${e.learnerId}`,
        resume: `${st.stagiaire_prenom} ${st.stagiaire_nom} — ${se.formation} (${se.session_numero})`,
        donnees: { ...st, ...se, tarif_ht: montant(insc?.prixHT), facture_a: insc?.facturerA ?? "" },
      };
    }
    case "SESSION_TERMINEE": {
      const se = await colonnesSession(e.sessionId);
      return se && { cle: `${e.type}:${e.sessionId}`, resume: `${se.formation} (${se.session_numero})`, donnees: se };
    }
    case "FACTURE_EMISE": {
      const f = await prisma.facture.findUnique({
        where: { id: e.factureId },
        select: { numero: true, montantHT: true, montantTTC: true, payeurNom: true, payeurType: true, dateEmission: true, dateEcheance: true, sessionId: true },
      });
      if (!f) return null;
      const se = f.sessionId ? await colonnesSession(f.sessionId) : null;
      return {
        cle: `${e.type}:${e.factureId}`,
        resume: `Facture ${f.numero ?? ""} — ${f.payeurNom}`,
        donnees: {
          facture_numero: f.numero ?? "",
          payeur: f.payeurNom,
          type_payeur: f.payeurType,
          montant_ht: montant(f.montantHT),
          montant_ttc: montant(f.montantTTC),
          date_emission: jour(f.dateEmission),
          date_echeance: jour(f.dateEcheance),
          ...(se ?? {}),
        },
      };
    }
  }
}

async function poster(url: string, corps: Record<string, unknown>): Promise<string | null> {
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corps),
      signal: AbortSignal.timeout(DELAI_MS),
      redirect: "error",
    });
    return r.ok ? null : `Make a répondu ${r.status}${r.status === 410 ? " (scénario supprimé ou désactivé)" : ""}.`;
  } catch (erreur) {
    return erreur instanceof Error && erreur.name === "TimeoutError" ? "Make n'a pas répondu à temps." : "Make est injoignable.";
  }
}

/// Envoie l'événement à chaque webhook actif qui l'a choisi, une seule fois
/// par webhook. Ne lève jamais d'exception : un échec est tracé, l'action
/// métier n'en souffre pas.
export async function publierEvenement(e: EvenementWebhook): Promise<void> {
  try {
    const webhooks = await prisma.webhook.findMany({ where: { actif: true, evenements: { has: e.type } } });
    if (webhooks.length === 0) return;
    const ligne = await preparer(e);
    if (!ligne) return;
    const corps = { evenement: e.type, libelle: EVENEMENTS_WEBHOOK[e.type], date: new Date().toISOString(), ...ligne.donnees };

    for (const w of webhooks) {
      // Réservation par la clé unique : jamais deux fois la même ligne.
      let envoi;
      try {
        envoi = await prisma.webhookEnvoi.create({ data: { webhookId: w.id, cle: ligne.cle, evenement: e.type, resume: ligne.resume, ok: false } });
      } catch (erreur) {
        if (erreur instanceof Prisma.PrismaClientKnownRequestError && erreur.code === "P2002") continue;
        throw erreur;
      }
      const echec = await poster(w.url, corps);
      await prisma.webhookEnvoi.update({ where: { id: envoi.id }, data: { ok: !echec, erreur: echec } });
    }
  } catch (erreur) {
    console.error("Connexions externes :", erreur);
  }
}

/// Nouvel essai d'un envoi en échec (même ligne, données du moment).
export async function renvoyer(envoiId: string): Promise<string | null> {
  const envoi = await prisma.webhookEnvoi.findUnique({ where: { id: envoiId }, include: { webhook: true } });
  if (!envoi) return "Envoi introuvable.";
  const [type, a, b] = envoi.cle.split(":");
  const e = (
    type === "APPRENANT_CREE" ? { type, learnerId: a }
    : type === "INSCRIPTION_SESSION" ? { type, sessionId: a, learnerId: b }
    : type === "SESSION_TERMINEE" ? { type, sessionId: a }
    : { type: "FACTURE_EMISE", factureId: a }
  ) as EvenementWebhook;
  const ligne = await preparer(e);
  if (!ligne) return "Les données de cet événement n'existent plus.";
  const echec = await poster(envoi.webhook.url, { evenement: e.type, libelle: EVENEMENTS_WEBHOOK[e.type], date: new Date().toISOString(), ...ligne.donnees });
  await prisma.webhookEnvoi.update({ where: { id: envoi.id }, data: { ok: !echec, erreur: echec } });
  return echec;
}

/// Ligne d'essai, pour que Make apprenne les colonnes (« Redetermine data
/// structure ») avant le premier vrai événement.
export async function envoyerEssai(webhookId: string): Promise<string | null> {
  const w = await prisma.webhook.findUnique({ where: { id: webhookId } });
  if (!w) return "Connexion introuvable.";
  const exemple: Record<string, string | number> = {
    stagiaire_prenom: "Camille", stagiaire_nom: "Exemple", stagiaire_email: "camille@exemple.fr", stagiaire_telephone: "06 00 00 00 00",
    stagiaire_ville: "Paris", stagiaire_entreprise: "", financement: "CPF", dossier_cpf: "",
    session_numero: "S-2026-0000", formation: "Formation d'exemple", formation_reference: "EXE-01", duree_heures: 14,
    date_debut: "2026-10-01", date_fin: "2026-10-02", modalite: "Présentiel", lieu: "", formateur: "", entreprise_cliente: "", nombre_inscrits: 1,
    tarif_ht: 1200, facture_a: "CAISSE_DES_DEPOTS",
    facture_numero: "", payeur: "", type_payeur: "", montant_ht: 0, montant_ttc: 0, date_emission: "", date_echeance: "",
  };
  return poster(w.url, { evenement: "ESSAI", libelle: "Ligne d'essai", date: new Date().toISOString(), ...exemple });
}
