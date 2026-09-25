import "server-only";

import { createHash, randomUUID } from "node:crypto";

import type { Company, Learner } from "@prisma/client";

import { cheminStockage } from "@/lib/documents-depot";
import { depuisCentimes, enCentimes, montantTTC } from "@/lib/factures";
import { LIBELLE_MODALITE } from "@/lib/formations-libelles";
import { henrriFetch, henrriTelecharger, HenrriError } from "@/lib/henrri/client";
import { journaliser } from "@/lib/journal";
import { prisma } from "@/lib/prisma";
import { ajouterJours, aujourdhuiUTC, formaterPeriode } from "@/lib/sessions-libelles";
import { stockage } from "@/lib/stockage";

/// Factures d'une session terminée, regroupées par payeur. Le payeur et le
/// tarif de chaque apprenant sont choisis à son inscription (décision du
/// client du 25/09/2026) :
/// - entreprise qui finance elle-même : une facture par entreprise, une
///   ligne par salarié ;
/// - OPCO ou France Travail en subrogation : une facture au nom du
///   financeur, par entreprise et par numéro de dossier, une ligne par
///   salarié ; l'entreprise et le dossier figurent dans le corps ;
/// - CPF : une facture par dossier, à la Caisse des Dépôts, avec l'identité
///   de l'apprenant et son numéro de dossier CPF dans le corps ;
/// - apprenant qui paie lui-même : une facture à son nom.
export async function chargerSessionPourFacturation(sessionId: string) {
  return prisma.trainingSession.findFirst({
    where: { id: sessionId, deletedAt: null },
    include: {
      formation: { select: { titre: true } },
      company: true,
      trainer: { select: { prenom: true, nom: true } },
      inscriptions: {
        where: { learner: { deletedAt: null } },
        orderBy: [{ learner: { nom: "asc" } }, { learner: { prenom: "asc" } }],
        include: { learner: { include: { company: true } }, dossierFinancement: true },
      },
      factures: { where: { statut: { not: "ANNULEE" } }, select: { id: true, origine: true } },
    },
  });
}

type Session = NonNullable<Awaited<ReturnType<typeof chargerSessionPourFacturation>>>;
type Inscription = Session["inscriptions"][number];

/// Une facture à émettre : son payeur, et les inscriptions qu'elle facture
/// (une ligne chacune, au tarif de l'inscription).
type Groupe =
  | { type: "ENTREPRISE"; company: Company; inscriptions: Inscription[] }
  | { type: "OPCO" | "FRANCE_TRAVAIL"; financeurNom: string; company: Company | null; reference: string | null; inscriptions: Inscription[] }
  | { type: "CAISSE_DES_DEPOTS" | "APPRENANT"; inscriptions: Inscription[] };

const IDENTIFIANT_SIRET = /^\d{14}$/;

const cleNom = (nom: string) => nom.trim().toLowerCase().replace(/\s+/g, " ");

/// Tarif de l'inscription ; à défaut (inscription antérieure au tarif), le
/// prix de la session.
function tarif(session: Session, inscription: Inscription): string | null {
  const prix = inscription.prixHT ?? session.prixHT;
  return prix === null ? null : Number(prix).toFixed(2);
}

/// Regroupe les inscriptions pas encore facturées par payeur. Tout ce qui
/// empêcherait une facture juste (tarif, entreprise, financeur, dossier CPF)
/// est signalé d'un coup, et rien n'est émis : mieux vaut une facturation qui
/// échoue et se voit qu'une facture incomplète déjà numérotée.
function regrouper(session: Session): { groupes: Groupe[] } | { erreur: string } {
  const problemes: string[] = [];
  const groupes = new Map<string, Groupe>();

  for (const inscription of session.inscriptions.filter((i) => !i.factureId)) {
    const nom = `${inscription.learner.prenom} ${inscription.learner.nom}`;
    if (tarif(session, inscription) === null) problemes.push(`${nom} : tarif non renseigné`);

    if (inscription.facturerA === "ENTREPRISE") {
      const company = inscription.learner.company ?? session.company;
      if (!company) {
        problemes.push(`${nom} : facturation à l'entreprise, mais aucune entreprise rattachée`);
        continue;
      }
      const cle = `ENTREPRISE|${company.id}`;
      const groupe = groupes.get(cle);
      if (groupe) groupe.inscriptions.push(inscription);
      else groupes.set(cle, { type: "ENTREPRISE", company, inscriptions: [inscription] });
    } else if (inscription.facturerA === "OPCO" || inscription.facturerA === "FRANCE_TRAVAIL") {
      const dossier = inscription.dossierFinancement;
      if (!dossier?.financeurNom.trim()) {
        problemes.push(`${nom} : nom du financeur à facturer manquant`);
        continue;
      }
      const company = inscription.learner.company ?? session.company;
      const reference = dossier.reference?.trim() || null;
      const cle = `${inscription.facturerA}|${cleNom(dossier.financeurNom)}|${company?.id ?? ""}|${reference ?? ""}`;
      const groupe = groupes.get(cle);
      if (groupe) groupe.inscriptions.push(inscription);
      else
        groupes.set(cle, {
          type: inscription.facturerA,
          financeurNom: dossier.financeurNom.trim(),
          company,
          reference,
          inscriptions: [inscription],
        });
    } else if (inscription.facturerA === "CAISSE_DES_DEPOTS") {
      if (!inscription.learner.numeroDossierCpf?.trim()) {
        problemes.push(`${nom} : numéro de dossier CPF manquant sur sa fiche`);
        continue;
      }
      groupes.set(`CPF|${inscription.id}`, { type: "CAISSE_DES_DEPOTS", inscriptions: [inscription] });
    } else if (inscription.facturerA === "APPRENANT") {
      groupes.set(`APPRENANT|${inscription.id}`, { type: "APPRENANT", inscriptions: [inscription] });
    } else {
      problemes.push(`${nom} : payeur « autre », à facturer à la main`);
    }
  }

  if (problemes.length > 0) return { erreur: problemes.join(" ; ") };
  return { groupes: [...groupes.values()] };
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

/// Adresse du siège de la Caisse des Dépôts, destinataire des factures CPF ;
/// les références de chaque apprenant figurent dans le corps de la facture,
/// jamais dans les coordonnées du client.
const CAISSE_DES_DEPOTS = {
  nom: "Caisse des Dépôts et Consignations",
  adresse: { address: "56 rue de Lille", city: "Paris", postCode: "75007", country: "France" },
};

/// Client Henrri d'un financeur tiers (OPCO, France Travail, Caisse des
/// Dépôts) : créé au premier besoin, puis retrouvé par son nom.
async function clientHenrriFinanceur(nom: string, adresse?: Record<string, string>): Promise<number> {
  const cle = cleNom(nom);
  const connu = await prisma.clientHenrriFinanceur.findUnique({ where: { cle } });
  if (connu) return connu.henrriCustomerId;

  const client = await henrriFetch<ClientHenrri>("/v1/customers", {
    method: "POST",
    body: JSON.stringify({
      name: nom,
      type: "professional",
      address: adresse ?? { country: "France" },
      // Henrri exige au moins un contact pour un client professionnel.
      contacts: [{ lastName: nom }],
    }),
  });
  await prisma.clientHenrriFinanceur.create({ data: { cle, nom, henrriCustomerId: client.id } });
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

/// Émet les factures d'une session terminée (voir `regrouper`) et renvoie
/// leurs identifiants. Une inscription déjà facturée est passée : une relance
/// après un échec partiel ne crée que les factures manquantes. Une facture
/// saisie à la main pour la session reprend la main sur tout.
export async function genererFacturesHenrriPourSession(sessionId: string, userId?: string): Promise<string[]> {
  const session = await chargerSessionPourFacturation(sessionId);
  if (!session) throw new HenrriError("Session introuvable.");
  if (session.factures.some((f) => f.origine === "MANUEL")) {
    throw new HenrriError("Une facture saisie à la main existe déjà pour cette session.");
  }

  const r = regrouper(session);
  if ("erreur" in r) throw new HenrriError(`Facturation automatique impossible : ${r.erreur}.`);
  if (r.groupes.length === 0) return [];

  const [documentTypeId, ligneTypeId, itemCategoryId] = await Promise.all([
    idTypeDocumentFacture(),
    idTypeLigneArticle(),
    idCategorieArticleService(),
  ]);
  const ids: string[] = [];
  for (const groupe of r.groupes) {
    ids.push(await emettreFacture(session, groupe, { documentTypeId, ligneTypeId, itemCategoryId }, userId));
  }
  return ids;
}

const nomComplet = (i: Inscription) => `${i.learner.prenom} ${i.learner.nom}`;

async function emettreFacture(
  session: Session,
  g: Groupe,
  types: { documentTypeId: number; ligneTypeId: number; itemCategoryId: number },
  userId?: string,
): Promise<string> {
  const seule = g.inscriptions.length === 1 ? g.inscriptions[0] : null;
  const company = g.type === "ENTREPRISE" || g.type === "OPCO" || g.type === "FRANCE_TRAVAIL" ? g.company : null;

  const customerId =
    g.type === "ENTREPRISE"
      ? await clientHenrriEntreprise(g.company)
      : g.type === "OPCO" || g.type === "FRANCE_TRAVAIL"
        ? await clientHenrriFinanceur(g.financeurNom)
        : g.type === "CAISSE_DES_DEPOTS"
          ? await clientHenrriFinanceur(CAISSE_DES_DEPOTS.nom, CAISSE_DES_DEPOTS.adresse)
          : await clientHenrriApprenant(g.inscriptions[0].learner);
  const payeurNom =
    g.type === "ENTREPRISE"
      ? g.company.raisonSociale
      : g.type === "OPCO" || g.type === "FRANCE_TRAVAIL"
        ? g.financeurNom
        : g.type === "CAISSE_DES_DEPOTS"
          ? CAISSE_DES_DEPOTS.nom
          : nomComplet(g.inscriptions[0]);

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
  // Références dans le corps de la facture, là où le payeur les cherche :
  // stagiaires pour l'entreprise, entreprise et dossier pour un financeur,
  // identité et dossier CPF pour la Caisse des Dépôts.
  const stagiaires = `${g.inscriptions.length > 1 ? "Stagiaires" : "Stagiaire"} : ${g.inscriptions.map(nomComplet).join(", ")}`;
  const references =
    g.type === "ENTREPRISE"
      ? stagiaires
      : g.type === "OPCO" || g.type === "FRANCE_TRAVAIL"
        ? [
            "Subrogation de paiement",
            g.company ? `Entreprise : ${g.company.raisonSociale}` : null,
            g.reference ? `Dossier n° ${g.reference}` : null,
            stagiaires,
          ]
            .filter(Boolean)
            .join(" · ")
        : g.type === "CAISSE_DES_DEPOTS"
          ? `Apprenant : ${nomComplet(g.inscriptions[0])} · Dossier CPF n° ${g.inscriptions[0].learner.numeroDossierCpf}`
          : null;
  const echeance = ajouterJours(aujourdhuiUTC(), 30);

  const document = await henrriFetch<{ id: number }>("/v1/documents", {
    method: "POST",
    body: JSON.stringify({
      documentTypeId: types.documentTypeId,
      customerId,
      title: session.formation.titre,
      subtitle: references ? `${references} — ${recapitulatif}` : recapitulatif,
      footerText: MENTION_EXONERATION,
      date: echeance.toISOString(),
    }),
  });

  // Une ligne par inscription, à son tarif. Une ligne facturable exige soit
  // un article du catalogue (itemId), soit un article transmis en ligne —
  // jamais uniquement une description : Henrri refuse sinon la ligne
  // (« requires an itemId or an item object »).
  let totalCentimes = 0;
  for (const inscription of g.inscriptions) {
    const montant = tarif(session, inscription)!;
    totalCentimes += enCentimes(montant);
    const description =
      g.type === "CAISSE_DES_DEPOTS"
        ? `${session.formation.titre} — ${references}`
        : g.type === "APPRENANT"
          ? `${session.formation.titre} — ${recapitulatif}`
          : `${session.formation.titre} — ${nomComplet(inscription)}`;
    await henrriFetch(`/v1/documents/${document.id}/lines`, {
      method: "POST",
      body: JSON.stringify({
        typeId: types.ligneTypeId,
        description,
        sellingPriceWithoutTax: Number(montant),
        quantity: 1,
        vatPercent: Number(TAUX_TVA),
        isTaxIncluded: false,
        item: {
          description,
          itemCategoryId: types.itemCategoryId,
          sellingPriceWithoutTax: Number(montant),
          vatPercent: Number(TAUX_TVA),
          isTaxIncluded: false,
        },
      }),
    });
  }

  // Irréversible côté Henrri à partir d'ici : le document est verrouillé et
  // reçoit son numéro définitif.
  const finalise = await henrriFetch<{ identity: string | null }>(`/v1/documents/${document.id}/finalize`, { method: "POST" });
  if (!finalise.identity) {
    throw new HenrriError(
      `Le document Henrri #${document.id} a été finalisé mais n'a reçu aucun numéro. Vérifiez-le dans Henrri : la facture n'a pas été enregistrée dans Formalogy OS.`,
    );
  }

  const montantHT = depuisCentimes(totalCentimes);
  const facture = await prisma.facture.create({
    data: {
      numero: finalise.identity,
      henrriId: String(document.id),
      objet: [
        `${session.formation.titre} — session ${session.numero}`,
        g.type === "OPCO" || g.type === "FRANCE_TRAVAIL" ? company?.raisonSociale : null,
        g.type === "CAISSE_DES_DEPOTS" ? `${nomComplet(g.inscriptions[0])} (dossier CPF ${g.inscriptions[0].learner.numeroDossierCpf})` : null,
      ]
        .filter(Boolean)
        .join(" — "),
      sessionId: session.id,
      companyId: company?.id ?? null,
      learnerId: seule?.learner.id ?? null,
      payeurType: g.type,
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
  // Les inscriptions facturées le sont une fois pour toutes, et le dossier
  // de financement porte la facture adressée au financeur.
  await prisma.sessionLearner.updateMany({ where: { id: { in: g.inscriptions.map((i) => i.id) } }, data: { factureId: facture.id } });
  const dossiers = g.inscriptions.map((i) => i.dossierFinancementId).filter((id): id is string => Boolean(id));
  if (dossiers.length > 0) await prisma.dossierFinancement.updateMany({ where: { id: { in: dossiers } }, data: { factureId: facture.id } });

  // Le PDF est un à-côté : s'il échoue, la facture existe déjà et reste
  // valide (numéro et montants corrects) — seul le PDF manquera, récupérable
  // à la main depuis Henrri en attendant.
  try {
    // Dans le dossier de l'apprenant quand la facture n'en concerne qu'un
    // (demande du client) ; sur la session et l'entreprise sinon.
    const documentId = await rangerPdfFacture({
      documentHenrriId: document.id,
      numero: finalise.identity,
      nomAffiche: `Facture ${finalise.identity} — ${payeurNom}${seule && g.type !== "APPRENANT" ? ` (${nomComplet(seule)})` : ""}`,
      session,
      companyId: company?.id ?? null,
      learnerId: seule?.learner.id ?? null,
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
    summary: `Facture ${finalise.identity} émise automatiquement via Henrri : ${payeurNom} (${g.inscriptions.map(nomComplet).join(", ")}) — ${montantTTC(montantHT, TAUX_TVA)} € TTC (session ${session.numero})`,
    entityType: "Facture",
    entityId: facture.id,
    userId,
    metadata: { sessionId: session.id, henrriDocumentId: document.id },
  });

  return facture.id;
}
