import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { PDFDocument } from "pdf-lib";

import { LIBELLE_FINANCEMENT } from "@/lib/apprenants-libelles";
import { marqueursDuModele, remplirModeleDocx } from "@/lib/conventions-docx";
import { genererConvocation } from "@/lib/convocation-pdf";
import { docxVersPdf } from "@/lib/docx-vers-pdf";
import { lireLogoOrganisme, lireSignatureOrganisme } from "@/lib/organisme-signature";
import { formaterMontant } from "@/lib/factures";
import { texteFormationVersBrut } from "@/lib/formations-assainir";
import { LIBELLE_MODALITE, modaliteEnLigne } from "@/lib/formations-libelles";
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
        programme: { select: { nom: true } },
      },
    }),
    prisma.sessionLearner.findFirst({
      where: { sessionId, learnerId, learner: { deletedAt: null } },
      include: { learner: { include: { company: true } }, dossierFinancement: true },
    }),
    lireOrganisme(),
  ]);
  if (!session || !inscription) return null;
  return { session, inscription, apprenant: inscription.learner, organisme };
}

/// L'entreprise qui signe : celle de la session (intra) ou, à défaut, celle
/// de l'apprenant. Sans entreprise, la convention est signée par le stagiaire.
function entrepriseSignataire(d: DonneesConvention) {
  return d.session.company ?? d.apprenant.company ?? null;
}

/// Valeurs de chaque marqueur. Une valeur absente laisse volontairement le
/// marqueur en place dans le document : un trou qui se voit vaut mieux qu'un
/// blanc silencieux au milieu d'une convention.
export function valeursConvention(d: DonneesConvention): Record<string, string | null | undefined> {
  const { session, apprenant, organisme, inscription } = d;
  const entreprise = entrepriseSignataire(d);
  const dossier = session.dossiers[0];

  const heures = nombre(session.formation.dureeHeures);
  const jours = nombre(session.formation.dureeJours) ?? String(session.jours?.length || joursDeSession(session.dateDebut, session.dateFin));
  // Tarif du stagiaire (saisi à son inscription) ; convention entreprise :
  // somme des tarifs de ses salariés inscrits. Le prix de session ou de
  // formation ne sert plus qu'à défaut.
  const salaries = entreprise ? session.inscriptions.filter((i) => (i.learner.companyId ?? session.companyId) === entreprise.id) : [];
  const prixHT = entreprise
    ? salaries.some((i) => i.prixHT !== null)
      ? salaries.reduce((t, i) => t + Number(i.prixHT ?? 0), 0)
      : (session.prixHT ?? session.formation.prixHT)
    : (inscription.prixHT ?? session.prixHT ?? session.formation.prixHT);
  // TVA 0 % (article 261-4-4° du CGI) : le TTC est égal au HT.
  const prix = prixHT === null ? undefined : formaterMontant(prixHT);
  const prixJour =
    prixHT === null || !jours || Number(jours.replace(",", ".")) === 0
      ? undefined
      : formaterMontant(Number(prixHT) / Number(jours.replace(",", ".")));

  const participants = session.inscriptions.map((i) => `${i.learner.prenom} ${i.learner.nom}`);
  const enLigne = modaliteEnLigne(session.modalite);
  const plateforme = session.plateforme === "EFORMA" ? "E-forma" : session.plateforme === "MON_PARCOURS_EN_LIGNE" ? "Mon Parcours En Ligne" : null;
  const financeur = inscription.dossierFinancement?.financeurNom ?? dossier?.financeurNom;
  const nDossier = inscription.dossierFinancement?.reference ?? dossier?.reference;

  // Qui paie (choisi à l'inscription) : la phrase de financement et les
  // conditions de règlement en découlent. CPF et OPCO prennent en charge
  // l'intégralité (client, 05/10/2026) ; seul le financement personnel
  // demande un règlement du stagiaire, après le délai de rétractation.
  const financement: Record<string, { phrase: string; reglement: string }> = {
    CAISSE_DES_DEPOTS: {
      phrase: "par le compte personnel de formation (CPF) du Stagiaire, via la Caisse des Dépôts et Consignations",
      reglement: "prise en charge intégrale par la Caisse des Dépôts et Consignations au titre du compte personnel de formation ; aucun règlement n'est demandé au Stagiaire",
    },
    OPCO: {
      phrase: `par l'OPCO ${financeur ?? "désigné"}${nDossier ? ` au titre du dossier de prise en charge n° ${nDossier}` : ""}`,
      reglement: "prise en charge intégrale par l'OPCO désigné ci-dessus, en subrogation de paiement",
    },
    FRANCE_TRAVAIL: {
      phrase: `par France Travail${nDossier ? ` (dossier n° ${nDossier})` : ""}`,
      reglement: "prise en charge intégrale par France Travail",
    },
    ENTREPRISE: {
      phrase: `par l'entreprise ${entreprise?.raisonSociale ?? ""}`.trim(),
      reglement: "règlement par l'entreprise à réception de la facture",
    },
    APPRENANT: {
      phrase: "par le Stagiaire lui-même, à titre individuel et à ses frais",
      reglement: "règlement par le Stagiaire à réception de la facture, après l'expiration du délai de rétractation de dix jours (article VIII)",
    },
  };
  const payeur = financement[inscription.facturerA] ?? financement.APPRENANT;

  const heuresTexte = heures ? `${heures} heures` : undefined;

  return {
    // — Formation et session, communes aux deux modèles
    INTITULE_FORMATION: session.formation.titre,
    REFERENCE_PROGRAMME: session.formation.reference,
    DATE_DEBUT: jourFr.format(session.dateDebut),
    DATE_FIN: jourFr.format(session.dateFin),
    HORAIRES: enLigne ? "Libres, au rythme du stagiaire (formation en ligne)" : (session.horaires ?? undefined),
    LIEU_FORMATION: enLigne ? `À distance${plateforme ? ` — plateforme ${plateforme}` : ""}` : (session.lieu ?? undefined),
    MODALITE: LIBELLE_MODALITE[session.modalite] + (enLigne && plateforme ? ` (plateforme ${plateforme})` : ""),
    DUREE: enLigne
      ? heuresTexte && `${heuresTexte} de formation en ligne, à réaliser du ${jourFr.format(session.dateDebut)} au ${jourFr.format(session.dateFin)}`
      : heuresTexte && `${jours} jour${jours === "1" ? "" : "s"} – ${heuresTexte}`,
    ENGAGEMENT_PARTICIPATION: enLigne
      ? "Le Stagiaire s'engage à suivre l'intégralité de son parcours de formation en ligne sur la période prévue ci-dessus."
      : "Le Stagiaire s'engage à assurer sa présence à la formation aux dates, lieu et heures prévus ci-dessus.",
    ENGAGEMENT_PARTICIPANTS: enLigne
      ? "Le bénéficiaire s'engage à ce que les participants désignés ci-dessus suivent l'intégralité du parcours de formation en ligne sur la période prévue."
      : "Le bénéficiaire s'engage à assurer la présence des participants désignés ci-dessus aux dates, lieux et heures prévus ci-dessus.",
    // Méthodes saisies au catalogue, à défaut un texte selon la modalité.
    MOYENS_PEDAGOGIQUES: session.formation.methodes?.trim()
      ? texteFormationVersBrut(session.formation.methodes)
      : enLigne
      ? `Parcours de formation sur la plateforme en ligne${plateforme ? ` ${plateforme}` : ""}, accessible à tout moment : modules interactifs, vidéos, exercices et tests d'évaluation ; accompagnement à distance par le formateur.`
      : "Formation animée par le formateur : supports de présentation, exercices pratiques et mises en situation, suivi individualisé des stagiaires.",
    MOYENS_SUIVI: enLigne
      ? "Relevés de connexion et d'activité de la plateforme en ligne (temps passé, progression du parcours) ; suivi pédagogique assuré par le formateur."
      : "Feuilles d'émargement signées par demi-journée de formation ; suivi pédagogique assuré par le formateur pendant la session.",
    // Rétractation de dix jours (L.6353-5) : seulement si le Stagiaire paie
    // lui-même sa formation.
    RETRACTATION:
      inscription.facturerA === "APPRENANT"
        ? "Conformément à l'article L.6353-5 du Code du travail, le Stagiaire dispose d'un délai de dix (10) jours, à compter de la signature du présent contrat, pour se rétracter. Il en informe FORMALOGY par lettre recommandée avec accusé de réception. Dans ce cas, aucune somme ne peut être exigée du Stagiaire."
        : "Sans objet : la formation n'est pas financée par le Stagiaire à titre individuel et à ses frais.",
    RETRACTATION_VERSEMENT:
      inscription.facturerA === "APPRENANT"
        ? "Aucun versement, quelle qu'en soit la forme, ne peut être exigé d'un Stagiaire avant l'expiration du délai de rétractation susvisé."
        : null,
    FINANCEMENT: payeur.phrase,
    CONDITIONS_REGLEMENT: payeur.reglement,
    TITRE_PROGRAMME: session.programme?.nom ?? session.formation.titre,
    DETAIL_PRIX: enLigne
      ? heuresTexte && `${heuresTexte} de formation en ligne.`
      : prixJour && heuresTexte && `${prixJour} par jour, soit ${heuresTexte} de formation sur ${jours} journée${jours === "1" ? "" : "s"}.`,
    NB_HEURES: heures,
    NB_JOURS: jours,
    NOM_FORMATEUR: session.trainer ? `${session.trainer.prenom} ${session.trainer.nom}` : undefined,

    // — Signature
    DATE_SIGNATURE: jourFr.format(new Date()),
    LIEU_SIGNATURE: organisme.ville ?? undefined,

    // — Stagiaire (convention « particulier »)
    // Sans civilité saisie, rien n'est écrit (pas un trou à combler).
    CIVILITE: apprenant.civilite === "MONSIEUR" ? "Monsieur" : apprenant.civilite === "MADAME" ? "Madame" : null,
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
    // Trois lignes dans le modèle : au-delà, les noms suivants rejoignent la
    // troisième ; une ligne sans participant reste vide.
    NOM_PARTICIPANT_1: participants[0] ?? null,
    NOM_PARTICIPANT_2: participants[1] ?? null,
    NOM_PARTICIPANT_3: participants.length > 2 ? participants.slice(2).join(", ") : null,
    STATUT_1: participants[0] ? "Salarié(e)" : null,
    STATUT_2: participants[1] ? "Salarié(e)" : null,
    STATUT_3: participants[2] ? "Salarié(e)" : null,
    FONCTION_1: null,
    FONCTION_2: null,
    FONCTION_3: null,

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
      jours: session.jours,
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
  DUREE_SUIVI: "La fiche formation n'a pas de champ durée de suivi.",
  N_DEVIS: "Formalogy OS ne gère pas de devis.",
  NOM_REPRESENTANT: "La fiche entreprise n'a pas de représentant légal.",
};

/// Le programme détaillé, annoncé « en annexe » par la convention, y est
/// joint : celui choisi sur la session (programme du formateur), à défaut
/// celui de la formation. Un programme absent ou qui n'est pas un PDF laisse
/// la convention telle quelle.
async function joindreProgramme(convention: Uint8Array, programmeId: string | null, formationId: string): Promise<Uint8Array> {
  const document = await prisma.document.findFirst({
    where: {
      deletedAt: null,
      type: { code: "PROGRAMME" },
      ...(programmeId ? { id: programmeId } : { formationId }),
    },
    orderBy: { updatedAt: "desc" },
    include: { versions: { orderBy: { numero: "desc" }, take: 1 } },
  });
  const version = document?.versions[0];
  if (!version || version.typeMime !== TYPE_MIME_PDF) return convention;
  try {
    const annexe = await PDFDocument.load(new Uint8Array(await (await stockage().lire(version.cheminStockage)).arrayBuffer()), { ignoreEncryption: true });
    // Métadonnées inchangées : une convention identique reste identique à l'octet près.
    const pdf = await PDFDocument.load(convention, { updateMetadata: false });
    for (const page of await pdf.copyPages(annexe, annexe.getPageIndices())) pdf.addPage(page);
    return await pdf.save();
  } catch (erreur) {
    console.error("Programme non joint à la convention :", erreur);
    return convention;
  }
}

/// Aperçu d'une convention avec un modèle donné (avant de le mettre en
/// place) : rien n'est enregistré.
export async function apercuConvention(sessionId: string, learnerId: string, modele: Uint8Array) {
  const donnees = await lireDonnees(sessionId, learnerId);
  if (!donnees) return null;
  const { octets, nonRemplis } = remplirModeleDocx(modele, valeursConvention(donnees));
  const pdf = await joindreProgramme(await docxVersPdf(octets, "Aperçu de convention", await lireSignatureOrganisme()), donnees.session.programmeId, donnees.session.formationId);
  return { pdf, nonRemplis };
}

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
        ? "Aucun modèle de convention entreprise déposé (Bibliothèque → type « Modèle de convention — entreprise »)."
        : "Aucun modèle de convention particulier déposé (Bibliothèque → type « Modèle de convention — particulier »).",
    };
  }

  const { octets: docxRempli, nonRemplis } = remplirModeleDocx(modele.octets, valeursConvention(donnees));
  const nomApprenant = `${donnees.apprenant.prenom} ${donnees.apprenant.nom}`;
  const titre = `Convention de formation — ${donnees.session.numero}`;
  const octets = await joindreProgramme(
    await docxVersPdf(docxRempli, titre, await lireSignatureOrganisme()),
    donnees.session.programmeId,
    donnees.session.formationId,
  );
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
