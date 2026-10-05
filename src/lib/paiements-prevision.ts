import "server-only";

import type { TypePayeur } from "@prisma/client";

import { enCentimes, LIBELLE_PAYEUR, situationFacture } from "@/lib/factures";
import { DELAIS_PAIEMENT, paiementAttendu } from "@/lib/paiements-attendus";
import { prisma } from "@/lib/prisma";
import { ajouterJours, aujourdhuiUTC } from "@/lib/sessions-libelles";

export type PaiementPrevu = {
  cle: string;
  du: Date;
  au: Date;
  payeur: string;
  detail: string;
  montantCentimes: number;
  /// Numéro de la facture, ou null tant que la session n'est pas facturée
  facture: string | null;
  lien: string;
};

/// Paiements attendus dans les prochains jours, d'après les délais habituels
/// des payeurs : factures émises pas encore soldées, et inscriptions des
/// sessions lancées qui seront facturées à la sortie de formation. Une
/// période de paiement déjà passée n'y figure plus (le paiement se suit dans
/// Henrri).
export async function paiementsPrevus(horizonJours = 60): Promise<PaiementPrevu[]> {
  const aujourdhui = aujourdhuiUTC();
  const limite = ajouterJours(aujourdhui, horizonJours);
  const dansLaPeriode = (p: { du: Date; au: Date }) => p.au >= aujourdhui && p.du <= limite;
  const prevus: PaiementPrevu[] = [];

  const factures = await prisma.facture.findMany({
    where: { statut: "EMISE" },
    select: {
      id: true,
      numero: true,
      statut: true,
      payeurNom: true,
      payeurType: true,
      montantTTC: true,
      dateEcheance: true,
      session: { select: { numero: true, dateFin: true, jours: true } },
      paiements: { select: { montant: true } },
    },
  });
  for (const f of factures) {
    const attendu = f.session ? paiementAttendu(f.payeurType, f.session.dateFin) : null;
    const periode = attendu ?? (f.dateEcheance ? { du: f.dateEcheance, au: f.dateEcheance } : null);
    const reste = situationFacture(f, f.paiements, aujourdhui).resteCentimes;
    if (!periode || !dansLaPeriode(periode) || reste === 0) continue;
    prevus.push({
      cle: `facture:${f.id}`,
      ...periode,
      payeur: f.payeurNom,
      detail: [f.numero && `facture ${f.numero}`, f.session && `session ${f.session.numero}`].filter(Boolean).join(" · "),
      montantCentimes: reste,
      facture: f.numero,
      lien: `/factures/${f.id}`,
    });
  }

  // Pas encore facturées : une ligne par session et par payeur.
  const inscriptions = await prisma.sessionLearner.findMany({
    where: {
      factureId: null,
      prixHT: { not: null },
      facturerA: { in: Object.keys(DELAIS_PAIEMENT) as TypePayeur[] },
      learner: { deletedAt: null },
      session: { deletedAt: null, statut: { notIn: ["BROUILLON", "ANNULEE"] } },
    },
    select: {
      prixHT: true,
      facturerA: true,
      parcoursTermineLe: true,
      dossierFinancement: { select: { financeurNom: true } },
      session: { select: { id: true, numero: true, dateFin: true, jours: true } },
    },
  });
  const groupes = new Map<string, PaiementPrevu>();
  const apprenants = new Map<string, number>();
  for (const i of inscriptions) {
    const periode = paiementAttendu(i.facturerA, i.parcoursTermineLe ?? i.session.dateFin);
    if (!periode || !dansLaPeriode(periode)) continue;
    const payeur = i.facturerA === "OPCO" ? (i.dossierFinancement?.financeurNom ?? "OPCO") : LIBELLE_PAYEUR[i.facturerA];
    const cle = `session:${i.session.id}:${i.facturerA}:${payeur}`;
    const groupe = groupes.get(cle) ?? {
      cle,
      du: periode.du,
      au: periode.au,
      payeur,
      detail: "",
      montantCentimes: 0,
      facture: null,
      lien: `/sessions/${i.session.id}`,
    };
    const nombre = (apprenants.get(cle) ?? 0) + 1;
    apprenants.set(cle, nombre);
    groupe.montantCentimes += enCentimes(i.prixHT);
    groupe.detail = `session ${i.session.numero} · ${nombre} apprenant${nombre > 1 ? "s" : ""}, à facturer à la sortie`;
    groupes.set(cle, groupe);
  }
  prevus.push(...groupes.values());

  return prevus.sort((a, b) => a.du.getTime() - b.du.getTime() || a.au.getTime() - b.au.getTime());
}
