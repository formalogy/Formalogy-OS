import "server-only";

import { createHash, randomUUID } from "node:crypto";

import type { Company, Learner } from "@prisma/client";

import { cheminStockage } from "@/lib/documents-depot";
import { montantTTC } from "@/lib/factures";
import { LIBELLE_MODALITE } from "@/lib/formations-libelles";
import { henrriFetch, henrriTelecharger, HenrriError } from "@/lib/henrri/client";
import { journaliser } from "@/lib/journal";
import { prisma } from "@/lib/prisma";
import { ajouterJours, aujourdhuiUTC, formaterPeriode } from "@/lib/sessions-libelles";
import { stockage } from "@/lib/stockage";

/// Une facture par session terminée : adressée à l'entreprise cliente si la
/// session en a une, sinon à l'unique apprenant inscrit. Une session sans
/// entreprise et avec zéro ou plusieurs apprenants n'a pas de payeur évident
/// et est signalée en échec plutôt que de deviner.
export async function chargerSessionPourFacturation(sessionId: string) {
  return prisma.trainingSession.findFirst({
    where: { id: sessionId, deletedAt: null },
    include: {
      formation: { select: { titre: true } },
      company: true,
      trainer: { select: { prenom: true, nom: true } },
      inscriptions: { where: { learner: { deletedAt: null } }, select: { learner: true } },
      factures: { where: { statut: { not: "ANNULEE" } }, select: { id: true } },
    },
  });
}

type Session = NonNullable<Awaited<ReturnType<typeof chargerSessionPourFacturation>>>;

const IDENTIFIANT_SIRET = /^\d{14}$/;

function payeur(session: Session): { type: "ENTREPRISE"; company: Company } | { type: "APPRENANT"; learner: Learner } | { erreur: string } {
  if (session.company) return { type: "ENTREPRISE", company: session.company };
  const apprenants = session.inscriptions.map((i) => i.learner);
  if (apprenants.length === 1) return { type: "APPRENANT", learner: apprenants[0] };
  if (apprenants.length === 0) return { erreur: "aucune entreprise cliente et aucun apprenant inscrit : impossible de savoir qui facturer" };
  return {
    erreur: `aucune entreprise cliente et ${apprenants.length} apprenants inscrits : impossible de savoir qui facturer automatiquement (à préparer à la main dans « Factures »)`,
  };
}

// ---------------------------------------------------------------------------
// Client Henrri : créé une seule fois par entreprise ou apprenant, réutilisé
// ensuite via l'identifiant mis en cache sur la fiche.
// ---------------------------------------------------------------------------

type ClientHenrri = { id: number };

async function clientHenrriEntreprise(company: Company): Promise<number> {
  if (company.henrriCustomerId) return company.henrriCustomerId;

  const siret = company.siret?.replace(/\s/g, "");
  const client = await henrriFetch<ClientHenrri>("/v1/customers", {
    method: "POST",
    body: JSON.stringify({
      name: company.raisonSociale,
      type: "professional",
      companyIdentifierType: "siret",
      siret: siret && IDENTIFIANT_SIRET.test(siret) ? siret : undefined,
      address: {
        address: company.adresse ?? undefined,
        city: company.ville ?? undefined,
        postCode: company.codePostal ?? undefined,
        country: "France",
      },
      // Henrri exige 1 à 4 contacts pour un client professionnel. À défaut de
      // contact enregistré dans le CRM, un contact générique est transmis :
      // Henrri ne peut pas laisser ce champ vide.
      contacts: [{ lastName: company.raisonSociale, email: company.email ?? undefined, phone: company.telephone ?? undefined }],
    }),
  });

  await prisma.company.update({ where: { id: company.id }, data: { henrriCustomerId: client.id } });
  return client.id;
}

async function clientHenrriApprenant(learner: Learner): Promise<number> {
  if (learner.henrriCustomerId) return learner.henrriCustomerId;

  const client = await henrriFetch<ClientHenrri>("/v1/customers", {
    method: "POST",
    body: JSON.stringify({
      name: `${learner.prenom} ${learner.nom}`,
      type: "individual",
      address: {
        address: learner.adresse ?? undefined,
        city: learner.ville ?? undefined,
        postCode: learner.codePostal ?? undefined,
        country: "France",
      },
      contacts: [{ firstName: learner.prenom, lastName: learner.nom, email: learner.email ?? undefined, phone: learner.telephone ?? undefined }],
    }),
  });

  await prisma.learner.update({ where: { id: learner.id }, data: { henrriCustomerId: client.id } });
  return client.id;
}

// ---------------------------------------------------------------------------
// Types et lignes de document : identifiants propres au compte Henrri,
// retrouvés à chaque facturation (volume trop faible pour justifier un cache
// qui pourrait devenir périmé sans qu'on s'en aperçoive).
// ---------------------------------------------------------------------------

/// Compare un champ d'énumération Henrri à la valeur attendue, sans casse.
/// Ces champs ne sont pas fiables : selon la ligne, Henrri renvoie soit son
/// nom (« item »), soit l'entier brut de l'énumération (1, 2, 7…). Tout ce
/// qui n'est pas une chaîne ne correspond donc simplement à rien.
function memeValeur(champ: unknown, attendu: string): boolean {
  return typeof champ === "string" && champ.toLowerCase() === attendu;
}

async function idTypeDocumentFacture(): Promise<number> {
  const { elements } = await henrriFetch<{ elements: { id: number; documentKind?: unknown }[] }>("/v1/documenttypes");
  // La documentation Henrri annonce un « documentKind » en PascalCase
  // (« Invoice ») ; le compte réel le renvoie en minuscules (« invoice ») —
  // comparaison insensible à la casse par prudence.
  const type = elements.find((t) => memeValeur(t.documentKind, "invoice"));
  if (!type) throw new HenrriError("Aucun type de document « facture » trouvé chez Henrri.");
  return type.id;
}

/// Un article transmis en ligne exige une catégorie (`itemCategoryId`) :
/// « Services » convient à une formation, vendue au forfait et non stockée.
async function idCategorieArticleService(): Promise<number> {
  const { elements } = await henrriFetch<{ elements: { id: number; itemCategoryKind?: unknown }[] }>("/v1/itemcategories");
  // Pas de repli sur la première catégorie venue : la première est « Produits »,
  // à 20 % de TVA. Mieux vaut une facturation qui échoue et se voit qu'une
  // facture partie chez le client avec la mauvaise TVA.
  const categorie = elements.find((c) => memeValeur(c.itemCategoryKind, "service"));
  if (!categorie) throw new HenrriError("Aucune catégorie d'article « Services » trouvée chez Henrri.");
  return categorie.id;
}

async function idTypeLigneArticle(): Promise<number> {
  const { elements } = await henrriFetch<{ elements: { id: number; label: string; type?: unknown }[] }>("/v1/documentlinetypes");
  // Le champ « type » est renvoyé tantôt en toutes lettres (« item »), tantôt
  // comme l'entier brut de l'énumération (« Titre » vaut 1) : le libellé
  // français reste le repère sûr pour distinguer une ligne facturable.
  const type = elements.find((t) => memeValeur(t.type, "item") || t.label === "Article");
  if (!type) throw new HenrriError("Aucun type de ligne « Article » trouvé chez Henrri.");
  return type.id;
}

// ---------------------------------------------------------------------------
// Rangement du PDF, selon la même convention que les autres documents générés
// (fin de formation, factures manuelles) : lib/documents-depot.ts pour le
// chemin, un Document de catégorie FINANCE rattaché à la session (et à
// l'entreprise ou à l'apprenant), consultable depuis leurs fiches comme
// depuis la liste des documents.
// ---------------------------------------------------------------------------

async function rangerPdfFacture(params: {
  documentHenrriId: number;
  numero: string;
  nomAffiche: string;
  session: Session;
  companyId: string | null;
  learnerId: string | null;
  userId?: string;
}) {
  const { downloadUrl } = await henrriFetch<{ downloadUrl: string; fileName: string | null }>(
    `/v1/documents/${params.documentHenrriId}/pdf/url`,
    { method: "POST" },
  );
  const octets = await henrriTelecharger(downloadUrl);

  const type = await prisma.documentType.findUniqueOrThrow({ where: { code: "FACTURE" } });
  const documentId = randomUUID();
  const chemin = cheminStockage(documentId, 1, "pdf");
  const nomFichier = `Facture-${params.numero}.pdf`.replace(/[\\/\u0000-\u001f"]/g, "_");

  await stockage().deposer(chemin, octets, "application/pdf");
  try {
    await prisma.document.create({
      data: {
        id: documentId,
        nom: params.nomAffiche,
        typeId: type.id,
        categorie: "FINANCE",
        statut: "VALIDE",
        sessionId: params.session.id,
        companyId: params.companyId,
        learnerId: params.learnerId,
        createdById: params.userId,
        versions: {
          create: {
            numero: 1,
            cheminStockage: chemin,
            nomFichier,
            typeMime: "application/pdf",
            taille: octets.byteLength,
            empreinte: createHash("sha256").update(octets).digest("hex"),
            createdById: params.userId,
          },
        },
      },
    });
  } catch (erreur) {
    await stockage().supprimer([chemin]).catch(() => undefined);
    throw erreur;
  }
  return documentId;
}

// ---------------------------------------------------------------------------
// Point d'entrée : une session terminée → une facture Henrri.
// ---------------------------------------------------------------------------

/// Formations professionnelles exonérées de TVA (article 261-4-4° du CGI) :
/// c'est le seul taux utilisé par Formalogy, ici comme dans la saisie manuelle.
const TAUX_TVA = "0";
const MENTION_EXONERATION = "TVA non applicable, article 261-4-4° du Code général des impôts.";

export async function genererFactureHenrriPourSession(sessionId: string, userId?: string): Promise<string> {
  const session = await chargerSessionPourFacturation(sessionId);
  if (!session) throw new HenrriError("Session introuvable.");
  if (session.factures.length > 0) throw new HenrriError("Une facture existe déjà pour cette session.");
  if (session.prixHT === null) throw new HenrriError("Le prix de la session n'est pas renseigné.");

  const p = payeur(session);
  if ("erreur" in p) throw new HenrriError(`Facturation automatique impossible : ${p.erreur}.`);

  const customerId = p.type === "ENTREPRISE" ? await clientHenrriEntreprise(p.company) : await clientHenrriApprenant(p.learner);
  const payeurNom = p.type === "ENTREPRISE" ? p.company.raisonSociale : `${p.learner.prenom} ${p.learner.nom}`;

  const modalite = LIBELLE_MODALITE[session.modalite];
  const periode = formaterPeriode(session.dateDebut, session.dateFin);
  const formateur = session.trainer ? `${session.trainer.prenom} ${session.trainer.nom}` : null;
  const recapitulatif = [
    `Session ${session.numero} — ${periode}`,
    modalite,
    session.lieu,
    formateur ? `Formatrice/formateur : ${formateur}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const echeance = ajouterJours(aujourdhuiUTC(), 30);

  const [documentTypeId, ligneTypeId, itemCategoryId] = await Promise.all([
    idTypeDocumentFacture(),
    idTypeLigneArticle(),
    idCategorieArticleService(),
  ]);

  const document = await henrriFetch<{ id: number }>("/v1/documents", {
    method: "POST",
    body: JSON.stringify({
      documentTypeId,
      customerId,
      title: session.formation.titre,
      subtitle: recapitulatif,
      footerText: MENTION_EXONERATION,
      date: echeance.toISOString(),
    }),
  });

  const ligneDescription = `${session.formation.titre} — ${recapitulatif}`;
  // Une ligne facturable exige soit un article du catalogue (itemId), soit un
  // article transmis en ligne — jamais uniquement une description : Henrri
  // refuse sinon la ligne (« requires an itemId or an item object »).
  await henrriFetch(`/v1/documents/${document.id}/lines`, {
    method: "POST",
    body: JSON.stringify({
      typeId: ligneTypeId,
      description: ligneDescription,
      sellingPriceWithoutTax: Number(session.prixHT),
      quantity: 1,
      vatPercent: Number(TAUX_TVA),
      isTaxIncluded: false,
      item: {
        description: ligneDescription,
        itemCategoryId,
        sellingPriceWithoutTax: Number(session.prixHT),
        vatPercent: Number(TAUX_TVA),
        isTaxIncluded: false,
      },
    }),
  });

  // Irréversible côté Henrri à partir d'ici : le document est verrouillé et
  // reçoit son numéro définitif.
  const finalise = await henrriFetch<{ identity: string | null }>(`/v1/documents/${document.id}/finalize`, { method: "POST" });
  if (!finalise.identity) {
    throw new HenrriError(
      `Le document Henrri #${document.id} a été finalisé mais n'a reçu aucun numéro. Vérifiez-le dans Henrri : la facture n'a pas été enregistrée dans Formalogy OS.`,
    );
  }

  const montantHT = Number(session.prixHT).toFixed(2);
  const facture = await prisma.facture.create({
    data: {
      numero: finalise.identity,
      henrriId: String(document.id),
      objet: `${session.formation.titre} — session ${session.numero}`,
      sessionId: session.id,
      companyId: p.type === "ENTREPRISE" ? p.company.id : null,
      learnerId: p.type === "APPRENANT" ? p.learner.id : null,
      payeurType: p.type,
      payeurNom,
      montantHT,
      tauxTva: TAUX_TVA,
      montantTTC: montantTTC(montantHT, TAUX_TVA),
      statut: "EMISE",
      origine: "AUTO",
      dateEmission: aujourdhuiUTC(),
      dateEcheance: echeance,
      createdById: userId,
    },
  });

  // Le PDF est un à-côté : s'il échoue, la facture existe déjà et reste
  // valide (numéro et montants corrects) — seul le PDF manquera, récupérable
  // à la main depuis Henrri en attendant.
  try {
    const documentId = await rangerPdfFacture({
      documentHenrriId: document.id,
      numero: finalise.identity,
      nomAffiche: `Facture ${finalise.identity} — ${payeurNom}`,
      session,
      companyId: p.type === "ENTREPRISE" ? p.company.id : null,
      learnerId: p.type === "APPRENANT" ? p.learner.id : null,
      userId,
    });
    await prisma.facture.update({ where: { id: facture.id }, data: { documentId } });
  } catch (erreur) {
    console.error(`PDF de la facture ${finalise.identity} (Henrri #${document.id}) non récupéré :`, erreur);
    await journaliser({
      action: "invoice.pdf_missing",
      summary: `Facture ${finalise.identity} émise mais son PDF n'a pas pu être récupéré depuis Henrri.`,
      entityType: "Facture",
      entityId: facture.id,
      userId,
    });
  }

  await journaliser({
    action: "invoice.auto_issued",
    summary: `Facture ${finalise.identity} émise automatiquement via Henrri : ${payeurNom} — ${montantTTC(montantHT, TAUX_TVA)} € TTC (session ${session.numero})`,
    entityType: "Facture",
    entityId: facture.id,
    userId,
    metadata: { sessionId: session.id, henrriDocumentId: document.id },
  });

  return facture.id;
}
