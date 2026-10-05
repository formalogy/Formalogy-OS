import "server-only";

import type { TypePayeur } from "@prisma/client";

import { CRENEAUX, joursDeSession } from "@/lib/emargement";
import { modaliteEnLigne } from "@/lib/formations-libelles";
import { lireOrganisme } from "@/lib/organisme";
import { prisma } from "@/lib/prisma";

/// Bilan pédagogique et financier (BPF, Cerfa n° 10443) d'un exercice civil,
/// calculé à la demande à partir des données de l'application (demande du
/// client du 02/10/2026). Rien n'est stocké. Les cadres que l'application ne
/// peut pas connaître (charges, sous-traitance, codes NSF) sont signalés « à
/// compléter », et chaque correspondance retenue est écrite à l'écran.

export type LigneBpf = { code: string; libelle: string; montant?: number; nombre?: number; heures?: number; note?: string };

/// Cadre C : origine des produits, d'après les factures émises dans l'année.
const PRODUITS: { code: string; libelle: string; payeurs: TypePayeur[]; note?: string }[] = [
  { code: "1", libelle: "Entreprises pour la formation de leurs salariés", payeurs: ["ENTREPRISE"] },
  { code: "2a", libelle: "OPCO — contrats d'apprentissage", payeurs: [] },
  { code: "2b", libelle: "OPCO — contrats de professionnalisation", payeurs: [] },
  { code: "2c", libelle: "Promotion ou reconversion par alternance", payeurs: [] },
  { code: "2d", libelle: "Projets de transition professionnelle", payeurs: [] },
  { code: "2e", libelle: "Compte personnel de formation (Caisse des Dépôts)", payeurs: ["CAISSE_DES_DEPOTS"] },
  { code: "2f", libelle: "Dispositifs pour les personnes en recherche d'emploi", payeurs: [] },
  { code: "2g", libelle: "Dispositifs pour les travailleurs non salariés", payeurs: [] },
  {
    code: "2h",
    libelle: "Plan de développement des compétences ou autres dispositifs (OPCO)",
    payeurs: ["OPCO"],
    note: "Toutes les factures aux OPCO sont classées ici : à répartir à la main en 2a à 2g si une action relève d'un contrat d'apprentissage ou de professionnalisation.",
  },
  { code: "3", libelle: "Pouvoirs publics pour la formation de leurs agents", payeurs: [] },
  { code: "4", libelle: "Instances européennes", payeurs: [] },
  { code: "5", libelle: "État", payeurs: [] },
  { code: "6", libelle: "Conseils régionaux", payeurs: [] },
  { code: "7", libelle: "France Travail", payeurs: ["FRANCE_TRAVAIL"] },
  { code: "8", libelle: "Autres ressources publiques", payeurs: [] },
  { code: "9", libelle: "Personnes à titre individuel et à leurs frais", payeurs: ["APPRENANT"] },
  { code: "10", libelle: "Autres organismes de formation (sous-traitance)", payeurs: [] },
  { code: "11", libelle: "Autres produits de la formation professionnelle", payeurs: ["AUTRE"] },
];

/// Cadre F-1 : type de stagiaire, d'après le payeur de l'inscription.
const TYPES_STAGIAIRE = [
  { code: "a", libelle: "Salariés d'employeurs privés hors apprentis" },
  { code: "b", libelle: "Apprentis" },
  { code: "c", libelle: "Personnes en recherche d'emploi" },
  { code: "d", libelle: "Particuliers à leurs propres frais" },
  { code: "e", libelle: "Autres stagiaires" },
] as const;

/// Cadre F-3 : objectif général, d'après le champ « certification » de la
/// formation (texte libre).
const OBJECTIFS = [
  { code: "a", libelle: "Diplôme ou titre inscrit au RNCP", motif: /RNCP|titre professionnel|dipl[oô]me/i },
  { code: "b", libelle: "Certification inscrite au répertoire spécifique (RS)", motif: /\bRS\b|r[ée]pertoire sp[ée]cifique|TOSA|ICDL|PCIE|Bright/i },
  { code: "c", libelle: "Certificat de qualification professionnelle (CQP) non enregistré", motif: /\bCQP\b/i },
  { code: "d", libelle: "Autres formations professionnelles", motif: null },
] as const;

const debutAnnee = (a: number) => new Date(Date.UTC(a, 0, 1));

export async function calculerBpf(annee: number) {
  const du = debutAnnee(annee);
  const au = debutAnnee(annee + 1);

  const [organisme, factures, inscriptions, sessions] = await Promise.all([
    lireOrganisme(),
    prisma.facture.findMany({
      where: { statut: { in: ["EMISE", "PAYEE"] }, numero: { not: null }, dateEmission: { gte: du, lt: au } },
      select: { payeurType: true, montantHT: true },
    }),
    // Stagiaires dont la formation s'est achevée dans l'exercice (en ligne :
    // à la fin de leur parcours, sinon à la fin de la session).
    prisma.sessionLearner.findMany({
      where: {
        learner: { deletedAt: null },
        session: { deletedAt: null, statut: { notIn: ["BROUILLON", "ANNULEE"] } },
        OR: [{ parcoursTermineLe: { gte: du, lt: au } }, { parcoursTermineLe: null, session: { dateFin: { gte: du, lt: au } } }],
      },
      select: {
        facturerA: true,
        learnerId: true,
        learner: { select: { companyId: true } },
        session: {
          select: {
            id: true,
            modalite: true,
            dateDebut: true,
            dateFin: true, jours: true,
            formation: { select: { id: true, titre: true, dureeHeures: true, certification: true, typeCertification: true, category: { select: { nom: true } } } },
            presences: { select: { learnerId: true, statut: true } },
          },
        },
      },
    }),
    // Cadre E : sessions de l'exercice et leurs formateurs.
    prisma.trainingSession.findMany({
      where: { deletedAt: null, statut: { notIn: ["BROUILLON", "ANNULEE"] }, dateFin: { gte: du, lt: au } },
      select: { trainer: { select: { id: true, statut: true } }, formation: { select: { dureeHeures: true } } },
    }),
  ]);

  // --- C. Produits
  const produits: LigneBpf[] = PRODUITS.map((p) => ({
    code: p.code,
    libelle: p.libelle,
    montant: factures.filter((f) => p.payeurs.includes(f.payeurType)).reduce((t, f) => t + Number(f.montantHT), 0),
    note: p.note,
  }));
  const totalProduits = produits.reduce((t, l) => t + (l.montant ?? 0), 0);

  // --- F. Stagiaires et heures (durée de la formation, moins les absences
  // signalées ; en ligne : durée complète)
  const heuresDe = (i: (typeof inscriptions)[number]) => {
    const duree = Number(i.session.formation.dureeHeures ?? 0);
    if (modaliteEnLigne(i.session.modalite)) return duree;
    const total = joursDeSession(i.session.dateDebut, i.session.dateFin, i.session.jours).length * CRENEAUX.length;
    const absences = i.session.presences.filter((p) => p.learnerId === i.learnerId && p.statut !== "PRESENT").length;
    return total ? Math.round(((duree * (total - absences)) / total) * 2) / 2 : duree;
  };
  const typeDe = (i: (typeof inscriptions)[number]): string => {
    switch (i.facturerA) {
      case "ENTREPRISE":
      case "OPCO":
        return "a";
      case "FRANCE_TRAVAIL":
        return "c";
      case "APPRENANT":
        return "d";
      case "CAISSE_DES_DEPOTS":
        // CPF : salarié s'il est rattaché à une entreprise, sinon « autres ».
        return i.learner.companyId ? "a" : "e";
      default:
        return "e";
    }
  };
  const cumuler = (cle: (i: (typeof inscriptions)[number]) => string) => {
    const m = new Map<string, { nombre: number; heures: number }>();
    for (const i of inscriptions) {
      const k = cle(i);
      const v = m.get(k) ?? { nombre: 0, heures: 0 };
      v.nombre++;
      v.heures += heuresDe(i);
      m.set(k, v);
    }
    return m;
  };

  const parType = cumuler(typeDe);
  const stagiaires: LigneBpf[] = TYPES_STAGIAIRE.map((t) => ({ code: t.code, libelle: t.libelle, ...(parType.get(t.code) ?? { nombre: 0, heures: 0 }) }));
  const totalStagiaires = { nombre: inscriptions.length, heures: stagiaires.reduce((t, l) => t + (l.heures ?? 0), 0) };

  // Le type saisi au catalogue fait foi ; à défaut, le texte de la certification.
  const parObjectif = cumuler((i) => {
    const t = i.session.formation.typeCertification;
    if (t === "RNCP") return "a";
    if (t === "RS") return "b";
    if (t === "AUCUNE") return "d";
    return OBJECTIFS.find((o) => o.motif?.test(i.session.formation.certification ?? ""))?.code ?? "d";
  });
  const objectifs: LigneBpf[] = OBJECTIFS.map((o) => ({ code: o.code, libelle: o.libelle, ...(parObjectif.get(o.code) ?? { nombre: 0, heures: 0 }) }));

  const parSpecialite = cumuler((i) => i.session.formation.category?.nom ?? "Sans catégorie");
  const specialites: LigneBpf[] = [...parSpecialite.entries()]
    .sort((a, b) => b[1].heures - a[1].heures)
    .slice(0, 5)
    .map(([nom, v]) => ({ code: "", libelle: nom, ...v }));

  // --- E. Formateurs : salariés de l'organisme, ou intervenants extérieurs.
  const formateurs = { internes: new Set<string>(), externes: new Set<string>(), heuresInternes: 0, heuresExternes: 0 };
  for (const s of sessions) {
    if (!s.trainer) continue;
    const heures = Number(s.formation.dureeHeures ?? 0);
    if (s.trainer.statut === "SALARIE") {
      formateurs.internes.add(s.trainer.id);
      formateurs.heuresInternes += heures;
    } else {
      formateurs.externes.add(s.trainer.id);
      formateurs.heuresExternes += heures;
    }
  }

  const sansDuree = new Set(inscriptions.filter((i) => !i.session.formation.dureeHeures).map((i) => i.session.formation.titre));
  const cpfSansSituation = inscriptions.filter((i) => typeDe(i) === "e" && i.facturerA === "CAISSE_DES_DEPOTS").length;

  return {
    annee,
    organisme,
    produits,
    totalProduits,
    stagiaires,
    totalStagiaires,
    objectifs,
    specialites,
    formateurs: {
      internes: { nombre: formateurs.internes.size, heures: formateurs.heuresInternes },
      externes: { nombre: formateurs.externes.size, heures: formateurs.heuresExternes },
    },
    alertes: [
      ...(sansDuree.size ? [`Durée en heures absente pour : ${[...sansDuree].join(", ")} — leurs heures comptent pour 0.`] : []),
      ...(cpfSansSituation
        ? [`${cpfSansSituation} stagiaire(s) CPF sans entreprise classé(s) en « autres stagiaires » : à reclasser selon leur situation (salarié, demandeur d'emploi…).`]
        : []),
    ],
  };
}
