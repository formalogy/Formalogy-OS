import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { LIBELLE_FINANCEMENT } from "@/lib/apprenants-libelles";
import { marqueursDuModele, remplirModeleDocx } from "@/lib/conventions-docx";
import { genererConvocation } from "@/lib/convocation-pdf";
import { docxVersPdf } from "@/lib/docx-vers-pdf";
import { lireLogoOrganisme, lireSignatureOrganisme } from "@/lib/organisme-signature";
import { formaterMontant } from "@/lib/factures";
import { LIBELLE_MODALITE } from "@/lib/formations-libelles";
import { lireOrganisme } from "@/lib/organisme";
import { prisma } from "@/lib/prisma";
import { stockage } from "@/lib/stockage";


/// Les conventions sont archivées et envoyées en PDF : c'est le format qu'un
/// destinataire ouvre sans rien installer, qui ne se modifie pas par
/// inadvertance, et qui part à la signature électronique. Le modèle, lui,
/// reste un .docx que le client modifie dans Word.
const TYPE_MIME_PDF = "application/pdf";

/// Deux modèles possibles : celui d'une convention signée par une entreprise,
/// celui d'une convention signée par le stagiaire lui-même.
export const CODES_MODELE = {
  ENTREPRISE: "MODELE_CONVENTION_ENTREPRISE",
  PARTICULIER: "MODELE_CONVENTION_PARTICULIER",
} as const;

const jourFr = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Paris" });

const adressePostale = (p: { adresse?: string | null; codePostal?: string | null; ville?: string | null }) =>
  [p.adresse, [p.codePostal, p.ville].filter(Boolean).join(" ")].filter((m) => m && m.trim()).join(", ") || undefined;

const nombre = (valeur: unknown) =>
  valeur === null || valeur === undefined ? undefined : String(Number(valeur)).replace(".", ",");

/// Nombre de jours calendaires couverts par la session, quand la formation
/// ne le précise pas elle-même.
function joursDeSession(debut: Date, fin: Date): number {
  return Math.round((fin.getTime() - debut.getTime()) / 86400000) + 1;
}

type DonneesConvention = NonNullable<Awaited<ReturnType<typeof lireDonnees>>>;

async function lireDonnees(sessionId: string, learnerId: string) {
  const [session, inscription, organisme] = await Promise.all([
    prisma.trainingSession.findFirst({
      where: { id: sessionId, deletedAt: null },
      include: {
        formation: true,
        trainer: true,
        company: true,
        inscriptions: { orderBy: { learner: { nom: "asc" } }, include: { learner: true } },
        dossiers: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    }),
    prisma.sessionLearner.findFirst({
      where: { sessionId, learnerId, learner: { deletedAt: null } },
      include: { learner: { include: { company: true } } },
    }),
    lireOrganisme(),
  ]);
  if (!session || !inscription) return null;
  return { session, apprenant: inscription.learner, organisme };
}

/// L'entreprise qui signe : celle de la session (intra) ou, à défaut, celle
/// de l'apprenant. Sans entreprise, la convention est signée par le stagiaire.
function entrepriseSignataire(d: DonneesConvention) {
  return d.session.company ?? d.apprenant.company ?? null;
}

/// Valeurs de chaque marqueur. Une valeur absente laisse volontairement le
/// marqueur en place dans le document : un trou qui se voit vaut mieux qu'un
/// blanc silencieux au milieu d'une convention.
export function valeursConvention(d: DonneesConvention): Record<string, string | undefined> {
  const { session, apprenant, organisme } = d;
  const entreprise = entrepriseSignataire(d);
  const dossier = session.dossiers[0];

  const heures = nombre(session.formation.dureeHeures);
  const jours = nombre(session.formation.dureeJours) ?? String(joursDeSession(session.dateDebut, session.dateFin));
  const prixHT = session.prixHT ?? session.formation.prixHT;
  // TVA 0 % (article 261-4-4° du CGI) : le TTC est égal au HT.
  const prix = prixHT === null ? undefined : formaterMontant(prixHT);
  const prixJour =
    prixHT === null || !jours || Number(jours.replace(",", ".")) === 0
      ? undefined
      : formaterMontant(Number(prixHT) / Number(jours.replace(",", ".")));

  const participants = session.inscriptions.map((i) => `${i.learner.prenom} ${i.learner.nom}`);

  return {
    // — Formation et session, communes aux deux modèles
    INTITULE_FORMATION: session.formation.titre,
    REFERENCE_PROGRAMME: session.formation.reference,
    DATE_DEBUT: jourFr.format(session.dateDebut),
    DATE_FIN: jourFr.format(session.dateFin),
    HORAIRES: session.horaires ?? undefined,
    LIEU_FORMATION: session.lieu ?? undefined,
    MODALITE: LIBELLE_MODALITE[session.modalite],
    NB_HEURES: heures,
    NB_JOURS: jours,
    NOM_FORMATEUR: session.trainer ? `${session.trainer.prenom} ${session.trainer.nom}` : undefined,

    // — Signature
    DATE_SIGNATURE: jourFr.format(new Date()),
    LIEU_SIGNATURE: organisme.ville ?? undefined,

    // — Stagiaire (convention « particulier »)
    NOM_STAGIAIRE: `${apprenant.prenom} ${apprenant.nom}`,
    ADRESSE_STAGIAIRE: adressePostale(apprenant),
    EMAIL_STAGIAIRE: apprenant.email ?? undefined,
    TELEPHONE_STAGIAIRE: apprenant.telephone ?? undefined,
    MODE_FINANCEMENT: LIBELLE_FINANCEMENT[apprenant.financement],
    PRIX_TTC: prix,

    // — Entreprise (convention « entreprise »)
    NOM_ENTREPRISE: entreprise?.raisonSociale,
    ADRESSE_ENTREPRISE: entreprise ? adressePostale(entreprise) : undefined,
    SIRET_ENTREPRISE: entreprise?.siret ?? undefined,
    CODE_APE: entreprise?.codeApe ?? undefined,
    PRIX_TOTAL_HT: prix,
    PRIX_JOUR: prixJour,
    NOM_PARTICIPANT_1: participants[0],
    NOM_PARTICIPANT_2: participants[1],
    NOM_PARTICIPANT_3: participants[2],

    // — Prise en charge
    NOM_OPCO: dossier?.financeurNom,
    N_DOSSIER_PRISE_EN_CHARGE: dossier?.reference ?? undefined,
  };
}

/// Produit la convocation d'un apprenant et la range dans les documents de
/// la session. Même principe que la convention : régénérer une convocation
/// identique ne crée pas de version de plus.
export async function genererConvocationApprenant(params: {
  sessionId: string;
  learnerId: string;
  userId?: string;
}): Promise<ResultatConvention> {
  const donnees = await lireDonnees(params.sessionId, params.learnerId);
  if (!donnees) return { erreur: "Session ou apprenant introuvable." };

  const { session, apprenant, organisme } = donnees;
  const octets = await genererConvocation({
    organisme,
    apprenant: { prenom: apprenant.prenom, nom: apprenant.nom },
    formation: { titre: session.formation.titre, dureeHeures: session.formation.dureeHeures },
    session: {
      numero: session.numero,
      dateDebut: session.dateDebut,
      dateFin: session.dateFin,
      horaires: session.horaires,
      lieu: session.lieu,
      modaliteLibelle: LIBELLE_MODALITE[session.modalite],
    },
    formateur: session.trainer
      ? {
          nom: `${session.trainer.prenom} ${session.trainer.nom}`,
          email: session.trainer.email,
          telephone: session.trainer.telephone,
        }
      : null,
    // Date d'établissement fixée au début de la session : une convocation
    // régénérée plus tard reste identique à l'octet près.
    etabliLe: session.dateDebut,
    signature: await lireSignatureOrganisme(),
    logo: await lireLogoOrganisme(),
  });

  const nomApprenant = `${apprenant.prenom} ${apprenant.nom}`;
  const nomFichier = nomFichierDocument("Convocation", session.numero, nomApprenant);
  const etat = await rangerDocumentGenere({
    typeCode: "CONVOCATION",
    octets,
    nom: `Convocation — ${nomApprenant} (${session.numero})`,
    nomFichier,
    sessionId: session.id,
    learnerId: apprenant.id,
    companyId: entrepriseSignataire(donnees)?.id ?? null,
    userId: params.userId,
  });

  return {
    document: etat.document,
    nonRemplis: [],
    etat: etat.etat,
    fichier: { nom: nomFichier, octets, typeMime: TYPE_MIME_PDF },
  };
}

/// Marqueurs qu'aucune donnée de Formalogy OS ne peut alimenter aujourd'hui.
/// Ils restent visibles dans la convention, à compléter à la main.
export const MARQUEURS_SANS_SOURCE: Record<string, string> = {
  CIVILITE: "La fiche apprenant n'a pas de champ civilité.",
  MOYENS_PEDAGOGIQUES: "La fiche formation n'a pas de champ moyens pédagogiques.",
  MOYENS_SUIVI: "La fiche formation n'a pas de champ moyens de suivi.",
  DUREE_SUIVI: "La fiche formation n'a pas de champ durée de suivi.",
  CONDITIONS_REGLEMENT: "Aucune condition de règlement n'est enregistrée.",
  N_DEVIS: "Formalogy OS ne gère pas de devis.",
  NOM_REPRESENTANT: "La fiche entreprise n'a pas de représentant légal.",
  FONCTION_1: "La fiche apprenant n'a pas de champ fonction.",
  FONCTION_2: "La fiche apprenant n'a pas de champ fonction.",
  FONCTION_3: "La fiche apprenant n'a pas de champ fonction.",
  STATUT_1: "La fiche apprenant n'a pas de champ statut professionnel.",
  STATUT_2: "La fiche apprenant n'a pas de champ statut professionnel.",
  STATUT_3: "La fiche apprenant n'a pas de champ statut professionnel.",
};

async function lireModele(code: string): Promise<{ octets: Uint8Array; nom: string } | null> {
  const document = await prisma.document.findFirst({
    where: { deletedAt: null, type: { code } },
    orderBy: { updatedAt: "desc" },
    include: { versions: { orderBy: { numero: "desc" }, take: 1 } },
  });
  const version = document?.versions[0];
  if (!document || !version) return null;
  const blob = await stockage().lire(version.cheminStockage);
  return { octets: new Uint8Array(await blob.arrayBuffer()), nom: document.nom };
}

export type ResultatConvention =
  | { erreur: string }
  | {
      document: { id: string; nom: string };
      nonRemplis: string[];
      etat: "cree" | "nouvelle_version" | "inchange";
      /// Le fichier lui-même, pour le joindre à un email sans le relire.
      fichier: { nom: string; octets: Uint8Array; typeMime: string };
    };

/// Génère la convention d'un apprenant pour une session, à partir du modèle
/// déposé dans la bibliothèque de documents, et la range comme document de la
/// session. Régénérer une convention identique ne crée pas de version de plus.
export async function genererConvention(params: {
  sessionId: string;
  learnerId: string;
  userId?: string;
}): Promise<ResultatConvention> {
  const donnees = await lireDonnees(params.sessionId, params.learnerId);
  if (!donnees) return { erreur: "Session ou apprenant introuvable." };

  const entreprise = entrepriseSignataire(donnees);
  const code = entreprise ? CODES_MODELE.ENTREPRISE : CODES_MODELE.PARTICULIER;
  const modele = await lireModele(code);
  if (!modele) {
    return {
      erreur: entreprise
        ? "Aucun modèle de convention entreprise déposé (Documents → type « Modèle de convention — entreprise »)."
        : "Aucun modèle de convention particulier déposé (Documents → type « Modèle de convention — particulier »).",
    };
  }

  const { octets: docxRempli, nonRemplis } = remplirModeleDocx(modele.octets, valeursConvention(donnees));
  const nomApprenant = `${donnees.apprenant.prenom} ${donnees.apprenant.nom}`;
  const titre = `Convention de formation — ${donnees.session.numero}`;
  const octets = await docxVersPdf(docxRempli, titre, await lireSignatureOrganisme());
  const nomFichier = nomFichierDocument("Convention", donnees.session.numero, entreprise ? entreprise.raisonSociale : nomApprenant);
  const etat = await rangerDocumentGenere({
    typeCode: "CONVENTION",
    octets,
    nom: `Convention de formation — ${entreprise ? entreprise.raisonSociale : nomApprenant} (${donnees.session.numero})`,
    nomFichier,
    sessionId: donnees.session.id,
    learnerId: entreprise ? null : donnees.apprenant.id,
    companyId: entreprise?.id ?? null,
    userId: params.userId,
  });

  return {
    document: etat.document,
    nonRemplis,
    etat: etat.etat,
    fichier: { nom: nomFichier, octets, typeMime: TYPE_MIME_PDF },
  };
}

const nomFichierDocument = (prefixe: string, numero: string, nom: string) =>
  `${prefixe}-${numero}-${nom}`.normalize("NFD").replace(/\p{M}/gu, "").replace(/[^A-Za-z0-9-]+/g, "-").replace(/-+/g, "-") + ".pdf";

/// Range un document généré (convention, convocation) dans les documents de
/// la session : nouveau document la première fois, nouvelle version si le
/// contenu a changé, rien s'il est identique.
async function rangerDocumentGenere(p: {
  typeCode: string;
  octets: Uint8Array;
  nom: string;
  nomFichier: string;
  sessionId: string;
  learnerId: string | null;
  companyId: string | null;
  userId?: string;
}) {
  const empreinte = createHash("sha256").update(p.octets).digest("hex");
  const type = await prisma.documentType.findUniqueOrThrow({ where: { code: p.typeCode } });
  const existant = await prisma.document.findFirst({
    where: { deletedAt: null, typeId: type.id, sessionId: p.sessionId, learnerId: p.learnerId },
    include: { versions: { orderBy: { numero: "desc" }, take: 1 } },
  });
  if (existant?.versions[0]?.empreinte === empreinte) {
    return { document: { id: existant.id, nom: existant.nom }, etat: "inchange" as const };
  }

  const documentId = existant?.id ?? randomUUID();
  const numero = (existant?.versions[0]?.numero ?? 0) + 1;
  const chemin = `${documentId}/v${numero}-${randomUUID()}.pdf`;
  await stockage().deposer(chemin, p.octets, TYPE_MIME_PDF);

  const version = {
    numero,
    cheminStockage: chemin,
    nomFichier: p.nomFichier,
    typeMime: TYPE_MIME_PDF,
    taille: p.octets.byteLength,
    empreinte,
    commentaire: existant ? "Régénérée après modification des données" : "Générée par Formalogy OS",
    createdById: p.userId,
  };

  try {
    if (existant) {
      await prisma.documentVersion.create({ data: { ...version, documentId } });
      await prisma.document.update({ where: { id: documentId }, data: { updatedAt: new Date() } });
      return { document: { id: documentId, nom: existant.nom }, etat: "nouvelle_version" as const };
    }
    await prisma.document.create({
      data: {
        id: documentId,
        nom: p.nom,
        typeId: type.id,
        categorie: "SESSION",
        statut: "VALIDE",
        sessionId: p.sessionId,
        learnerId: p.learnerId,
        companyId: p.companyId,
        createdById: p.userId,
        versions: { create: version },
      },
    });
    return { document: { id: documentId, nom: p.nom }, etat: "cree" as const };
  } catch (erreur) {
    await stockage().supprimer([chemin]).catch(() => undefined);
    throw erreur;
  }
}

/// Marqueurs attendus par les modèles déposés, pour l'écran de diagnostic.
export async function diagnosticModeles() {
  const resultats = [];
  for (const [libelle, code] of [["Entreprise", CODES_MODELE.ENTREPRISE], ["Particulier", CODES_MODELE.PARTICULIER]] as const) {
    const modele = await lireModele(code);
    resultats.push({
      libelle,
      code,
      nom: modele?.nom ?? null,
      marqueurs: modele ? marqueursDuModele(modele.octets) : [],
    });
  }
  return resultats;
}
