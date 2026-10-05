import "server-only";

import type { Automation } from "@prisma/client";

import { lireRegle } from "@/lib/automatisations/moteur";
import { joursDeSession } from "@/lib/emargement";
import { prisma } from "@/lib/prisma";
import { manquesRealisation } from "@/lib/realisation";
import { ajouterJours, aujourdhuiUTC } from "@/lib/sessions-libelles";

/// Frise du déroulement d'une session (demande du client du 02/10/2026,
/// d'après Qualiobee) : ce que les automatisations actives prévoient pour
/// elle, date par date, et ce qui en est réellement parti — lu dans la trace
/// des exécutions (`automation_runs`), jamais supposé.

export type EtatEtape = "fait" | "echec" | "prevu" | "du" | "attente";

export type Etape = {
  /// Jour prévu (minuit UTC), null pour « dès que… »
  jour: Date | null;
  heure: number | null;
  libelle: string;
  etat: EtatEtape;
  /// Précision : motif d'un échec, progression d'un envoi quotidien…
  detail?: string;
};

export type Phase = { titre: string; etapes: Etape[] };

const PHASES = { avant: "Avant la formation", pendant: "Pendant la formation", fin: "Fin de formation", apres: "Après la formation" } as const;

type Run = { automationId: string; statut: "REUSSIE" | "IGNOREE" | "ECHEC"; detail: string | null; cleUnicite: string; createdAt: Date };

/// Une automatisation dont les conditions de session (modalité, plateforme)
/// ne correspondent pas à cette session ne la concerne pas.
function concerne(a: Automation, s: { modalite: string; plateforme: string | null }) {
  const { modalite, avecPlateforme } = lireRegle(a).conditions;
  // E-learning : ni émargement, ni relance d'émargement.
  if (s.modalite === "E_LEARNING") {
    if (a.declencheur === "SESSION_JOUR" || a.declencheur === "FIN_DEMI_JOURNEE") return false;
    if (lireRegle(a).actions.some((x) => x.type === "RELANCE_EMARGEMENT")) return false;
  }
  if (modalite && !modalite.includes(s.modalite as never)) return false;
  if (avecPlateforme && (!s.plateforme || s.plateforme === "FORMATEUR")) return false;
  return true;
}

export async function friseSession(sessionId: string): Promise<{ phases: Phase[]; lancee: boolean; suspendue: boolean } | null> {
  const session = await prisma.trainingSession.findFirst({
    where: { id: sessionId, deletedAt: null },
    select: { id: true, dateDebut: true, dateFin: true, jours: true, modalite: true, plateforme: true, statut: true, deroulementSuspenduAt: true },
  });
  if (!session) return null;

  const [automations, runs] = await Promise.all([
    prisma.automation.findMany({ where: { actif: true }, orderBy: { nom: "asc" } }),
    prisma.automationRun.findMany({
      where: { entityType: "TrainingSession", entityId: session.id },
      select: { automationId: true, statut: true, detail: true, cleUnicite: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }) as Promise<Run[]>,
  ]);

  const lancee = session.statut !== "BROUILLON";
  const suspendue = Boolean(session.deroulementSuspenduAt);
  const aujourdhui = aujourdhuiUTC();

  /// État d'une étape d'après ses exécutions : la plus récente fait foi.
  function etat(runsEtape: Run[], jour: Date | null): Pick<Etape, "etat" | "detail"> {
    const dernier = runsEtape[0];
    if (dernier?.statut === "REUSSIE") return { etat: "fait", detail: `Fait le ${dernier.createdAt.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}` };
    if (dernier?.statut === "ECHEC") return { etat: "echec", detail: dernier.detail ?? undefined };
    if (dernier?.statut === "IGNOREE") return { etat: "fait", detail: dernier.detail ?? "Rien à envoyer" };
    if (!lancee) return { etat: "attente", detail: "Partira une fois le déroulement lancé" };
    if (suspendue) return { etat: "attente", detail: "Déroulement suspendu" };
    if (jour && jour <= aujourdhui) return { etat: "du", detail: "Prévu, pas encore parti : il partira au prochain réveil de l'application" };
    return { etat: "prevu" };
  }

  const phases: Record<keyof typeof PHASES, Etape[]> = { avant: [], pendant: [], fin: [], apres: [] };
  const jours = joursDeSession(session.dateDebut, session.dateFin, session.jours);

  for (const a of automations) {
    if (!concerne(a, session)) continue;
    const { jours: nb, heure } = lireRegle(a).parametres;
    const runsA = runs.filter((r) => r.automationId === a.id);
    const h = heure ?? null;

    switch (a.declencheur) {
      case "SESSION_AVANT_DEBUT": {
        const jour = ajouterJours(session.dateDebut, -(nb ?? 2));
        // La clé porte la date de début : une session reportée repart de zéro.
        const runsDate = runsA.filter((r) => r.cleUnicite.includes(`:${session.dateDebut.toISOString().slice(0, 10)}:`));
        phases.avant.push({ jour, heure: h, libelle: a.nom, ...etat(runsDate, jour) });
        break;
      }
      case "SESSION_AVANT_FIN": {
        const jour = ajouterJours(session.dateFin, -(nb ?? 0));
        const runsDate = runsA.filter((r) => r.cleUnicite.includes(`:${session.dateFin.toISOString().slice(0, 10)}:`));
        phases.fin.push({ jour, heure: h, libelle: a.nom, ...etat(runsDate, jour) });
        break;
      }
      case "SESSION_APRES_FIN": {
        const jour = ajouterJours(session.dateFin, nb ?? 1);
        phases[(nb ?? 1) <= 1 ? "fin" : "apres"].push({ jour, heure: h, libelle: a.nom, ...etat(runsA, jour) });
        break;
      }
      case "REALISATION_COMPLETE": {
        const e = etat(runsA, null);
        if (e.etat === "prevu" || e.etat === "du") {
          const manques = await manquesRealisation(session.id);
          e.etat = "prevu";
          e.detail = manques && manques.length > 0 ? `Attend : ${manques.slice(0, 3).join(" ; ")}` : "Dès que la réalisation est prouvée";
        }
        phases.fin.push({ jour: null, heure: null, libelle: a.nom, ...e });
        break;
      }
      case "SESSION_JOUR":
      case "FIN_DEMI_JOURNEE": {
        // Un envoi par jour de formation (ou par demi-journée) : une seule
        // ligne, avec la progression.
        const passes = jours.filter((j) => j <= aujourdhui).length;
        const faits = new Set(runsA.filter((r) => r.statut !== "ECHEC").map((r) => r.cleUnicite.match(/jour:(\d{4}-\d{2}-\d{2})/)?.[1]).filter(Boolean)).size;
        const echec = runsA.find((r) => r.statut === "ECHEC");
        // Fin de demi-journée : vers 12 h 30 le matin, 17 h 30 l'après-midi
        // (heures lues dans les horaires de la session au moment de l'envoi).
        const creneau = lireRegle(a).parametres.creneau;
        const moment = a.declencheur === "FIN_DEMI_JOURNEE" ? (creneau === "MATIN" ? 12.5 : 17.5) : h;
        const base = { jour: jours[0] ?? session.dateDebut, heure: moment, libelle: `${a.nom} — chaque jour de formation` };
        if (echec && faits < passes) phases.pendant.push({ ...base, etat: "echec", detail: echec.detail ?? undefined });
        else if (!lancee || suspendue) phases.pendant.push({ ...base, ...etat([], null) });
        else if (passes === 0) phases.pendant.push({ ...base, etat: "prevu", detail: `${jours.length} jour(s) de formation` });
        else phases.pendant.push({ ...base, etat: faits >= passes ? (passes === jours.length ? "fait" : "prevu") : "du", detail: `${Math.min(faits, passes)} / ${jours.length} jour(s) traités` });
        break;
      }
      // Les autres déclencheurs ne sont pas liés au calendrier d'une session
      // (inscription, campagnes, devis…).
    }
  }

  const ordre = (x: Etape, y: Etape) =>
    (x.jour?.getTime() ?? Infinity) - (y.jour?.getTime() ?? Infinity) || (x.heure ?? 0) - (y.heure ?? 0) || x.libelle.localeCompare(y.libelle, "fr");
  return {
    lancee,
    suspendue,
    phases: (Object.keys(PHASES) as (keyof typeof PHASES)[])
      .map((cle) => ({ titre: PHASES[cle], etapes: phases[cle].sort(ordre) }))
      .filter((p) => p.etapes.length > 0),
  };
}
