import "server-only";

import type { Devis, StatutDevis } from "@prisma/client";

import { henrriConfigure, henrriFetch, henrriTelecharger } from "@/lib/henrri/client";
import { prisma } from "@/lib/prisma";

/// Devis (automatisation A-15, décision du client du 29/09/2026) : ils se font
/// dans Henrri. L'application les reprend pour les compter, les rapprocher de
/// la fiche du CRM et les relancer (lib/automatisations/moteur.ts). Un devis
/// est accepté quand le client le valide en ligne dans Henrri, ou quand
/// l'apprenant (ou un salarié de l'entreprise) est inscrit à une session
/// après la date du devis.

export const LIBELLE_STATUT_DEVIS: Record<StatutDevis, string> = {
  EN_ATTENTE: "En attente",
  ACCEPTE: "Accepté",
  REFUSE: "Refusé",
  SANS_SUITE: "Sans suite",
};

export const TON_STATUT_DEVIS: Record<StatutDevis, string> = {
  EN_ATTENTE: "bg-accent-pale text-accent-fort",
  ACCEPTE: "bg-succes/12 text-succes",
  REFUSE: "bg-danger-pale text-danger",
  SANS_SUITE: "bg-surface-creuse text-texte-doux",
};

type LigneHenrri = {
  id: number;
  identity: string | null;
  finalized: boolean;
  documentTypeId: number;
  title: string | null;
  subtitle: string | null;
  priceBeforeTax: number;
  priceAfterTax: number;
  date: string;
  validated: boolean;
  customerId: number;
  customer?: { name?: string | null } | null;
};

type ClientHenrri = {
  id: number;
  name: string;
  type?: string;
  contacts?: { firstName?: string | null; lastName?: string | null; email?: string | null }[] | null;
};

/// Type « devis » du compte Henrri (son identifiant varie d'un compte à l'autre).
async function idTypeDevis(): Promise<number | null> {
  const { elements } = await henrriFetch<{ elements: { id: number; documentKind?: unknown }[] }>("/v1/documenttypes");
  // Même prudence que pour les factures : casse variable selon les réponses.
  return elements.find((t) => typeof t.documentKind === "string" && t.documentKind.toLowerCase() === "quotation")?.id ?? null;
}

const jourDe = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
const normaliser = (texte: string) =>
  texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/// Fiche du CRM correspondant au client d'un devis : par l'identifiant du
/// client Henrri (créé par l'application pour une facture), puis par
/// l'adresse email, puis par le nom.
async function rapprocher(client: { henrriCustomerId: number | null; nom: string; email: string | null }) {
  const trouve: { learnerId?: string; companyId?: string; prospectId?: string } = {};
  if (client.henrriCustomerId) {
    const [apprenant, entreprise] = await Promise.all([
      prisma.learner.findFirst({ where: { henrriCustomerId: client.henrriCustomerId, deletedAt: null }, select: { id: true } }),
      prisma.company.findFirst({ where: { henrriCustomerId: client.henrriCustomerId, deletedAt: null }, select: { id: true } }),
    ]);
    if (apprenant) trouve.learnerId = apprenant.id;
    if (entreprise) trouve.companyId = entreprise.id;
  }
  if (client.email) {
    const email = { equals: client.email, mode: "insensitive" as const };
    const [apprenant, prospect, entreprise] = await Promise.all([
      trouve.learnerId ? null : prisma.learner.findFirst({ where: { email, deletedAt: null }, select: { id: true } }),
      prisma.prospect.findFirst({ where: { email, deletedAt: null }, select: { id: true } }),
      trouve.companyId ? null : prisma.company.findFirst({ where: { email, deletedAt: null }, select: { id: true } }),
    ]);
    if (apprenant) trouve.learnerId = apprenant.id;
    if (prospect) trouve.prospectId = prospect.id;
    if (entreprise) trouve.companyId = entreprise.id;
  }
  const nom = normaliser(client.nom);
  const mots = nom.split(" ").filter((m) => m.length > 1);
  if (mots.length > 0 && !trouve.learnerId && !trouve.prospectId && !trouve.companyId) {
    const parMot = (champ: "nom" | "raisonSociale") => ({ OR: mots.map((m) => ({ [champ]: { contains: m, mode: "insensitive" as const } })) });
    const [apprenants, prospects, entreprises] = await Promise.all([
      prisma.learner.findMany({ where: { deletedAt: null, ...parMot("nom") }, select: { id: true, prenom: true, nom: true }, take: 50 }),
      prisma.prospect.findMany({ where: { deletedAt: null, ...parMot("nom") }, select: { id: true, prenom: true, nom: true }, take: 50 }),
      prisma.company.findMany({ where: { deletedAt: null, ...parMot("raisonSociale") }, select: { id: true, raisonSociale: true }, take: 50 }),
    ]);
    const memePersonne = (p: { prenom: string; nom: string }) =>
      normaliser(`${p.prenom} ${p.nom}`) === nom || normaliser(`${p.nom} ${p.prenom}`) === nom;
    // Un nom partagé par plusieurs fiches ne permet pas de choisir : pas de rapprochement.
    const unique = <T,>(liste: T[]) => (liste.length === 1 ? liste[0] : undefined);
    trouve.learnerId = unique(apprenants.filter(memePersonne))?.id;
    trouve.prospectId = unique(prospects.filter(memePersonne))?.id;
    trouve.companyId = unique(entreprises.filter((e) => normaliser(e.raisonSociale) === nom))?.id;
  }
  return trouve;
}

/// Passe un devis en attente à « accepté » ou « refusé » d'après le CRM :
/// inscription de l'apprenant (ou d'un salarié de l'entreprise) à une session
/// après la date du devis, prospect gagné ou perdu.
async function evaluerDevis(d: Pick<Devis, "id" | "date" | "learnerId" | "companyId" | "prospectId">): Promise<StatutDevis | null> {
  const inscription = await prisma.sessionLearner.findFirst({
    where: {
      createdAt: { gte: d.date },
      session: { deletedAt: null, statut: { not: "ANNULEE" } },
      OR: [
        ...(d.learnerId ? [{ learnerId: d.learnerId }] : []),
        ...(d.companyId ? [{ learner: { companyId: d.companyId } }, { session: { companyId: d.companyId } }] : []),
      ],
    },
    orderBy: { createdAt: "asc" },
    select: { session: { select: { numero: true } } },
  });
  let statut: StatutDevis | null = null;
  let motif = "";
  if ((d.learnerId || d.companyId) && inscription) {
    statut = "ACCEPTE";
    motif = `Inscription à la session ${inscription.session.numero}`;
  } else if (d.prospectId) {
    const prospect = await prisma.prospect.findUnique({ where: { id: d.prospectId }, select: { statut: true } });
    if (prospect?.statut === "GAGNE") [statut, motif] = ["ACCEPTE", "Prospect gagné dans le CRM"];
    if (prospect?.statut === "PERDU") [statut, motif] = ["REFUSE", "Prospect perdu dans le CRM"];
  }
  if (statut) await prisma.devis.update({ where: { id: d.id }, data: { statut, motifStatut: motif, statutAt: new Date() } });
  return statut;
}

/// Reprend les devis de Henrri : les nouveaux sont créés et rapprochés du
/// CRM, les autres mis à jour (montant, validation en ligne). Seuls les devis
/// finalisés (numérotés, donc envoyés) comptent. Puis les devis en attente
/// sont confrontés au CRM (inscriptions, prospects).
export async function synchroniserDevis(): Promise<{ nouveaux: number; acceptes: number }> {
  const bilan = { nouveaux: 0, acceptes: 0 };
  if (!henrriConfigure()) return bilan;
  const typeDevis = await idTypeDevis();
  if (typeDevis === null) return bilan;

  const lignes: LigneHenrri[] = [];
  for (let page = 1; page <= 100; page++) {
    const r = await henrriFetch<{ elements: LigneHenrri[]; meta?: { hasNext?: boolean } }>(`/v1/documents?page=${page}&pageSize=100`);
    lignes.push(...r.elements);
    if (!r.meta?.hasNext) break;
  }

  const connus = new Map((await prisma.devis.findMany({ select: { id: true, henrriId: true, statut: true } })).map((d) => [d.henrriId, d]));
  for (const l of lignes) {
    if (l.documentTypeId !== typeDevis || !l.finalized || !l.identity) continue;
    const donnees = {
      numero: l.identity,
      date: jourDe(l.date),
      objet: l.title || l.subtitle || null,
      montantHT: l.priceBeforeTax,
      montantTTC: l.priceAfterTax,
    };
    const valide = l.validated ? { statut: "ACCEPTE" as const, motifStatut: "Validé en ligne dans Henrri", statutAt: new Date() } : {};
    const connu = connus.get(l.id);
    if (connu) {
      await prisma.devis.update({ where: { id: connu.id }, data: { ...donnees, ...(connu.statut === "EN_ATTENTE" ? valide : {}) } });
      if (l.validated && connu.statut === "EN_ATTENTE") bilan.acceptes++;
      continue;
    }

    const client = await henrriFetch<ClientHenrri>(`/v1/customers/${l.customerId}`).catch(() => null);
    const contact = client?.contacts?.find((c) => c.email?.trim()) ?? client?.contacts?.[0];
    const email = contact?.email?.trim() || null;
    const clientNom = client?.name || l.customer?.name || "Client Henrri";
    const fiches = await rapprocher({ henrriCustomerId: l.customerId, nom: clientNom, email });
    await prisma.devis.create({
      data: {
        henrriId: l.id,
        ...donnees,
        henrriCustomerId: l.customerId,
        clientNom,
        contactNom: [contact?.firstName, contact?.lastName].filter(Boolean).join(" ") || null,
        email,
        ...fiches,
        ...valide,
      },
    });
    bilan.nouveaux++;
    if (l.validated) bilan.acceptes++;
  }

  // Un devis encore sans fiche peut en trouver une depuis (apprenant créé
  // après le devis), puis être accepté par une inscription.
  for (const d of await prisma.devis.findMany({ where: { statut: "EN_ATTENTE" } })) {
    let courant = d;
    if (!d.learnerId && !d.companyId && !d.prospectId) {
      const fiches = await rapprocher({ henrriCustomerId: d.henrriCustomerId, nom: d.clientNom, email: d.email });
      if (fiches.learnerId || fiches.companyId || fiches.prospectId) courant = await prisma.devis.update({ where: { id: d.id }, data: fiches });
    }
    if ((await evaluerDevis(courant)) === "ACCEPTE") bilan.acceptes++;
  }
  return bilan;
}

/// Adresse de relance d'un devis : le contact du client dans Henrri, à défaut
/// la fiche rapprochée dans le CRM (un devis se fait toujours pour un client
/// dont l'adresse est connue, a précisé le client).
export async function adresseDevis(d: Pick<Devis, "email" | "learnerId" | "prospectId" | "companyId">): Promise<string | null> {
  if (d.email) return d.email;
  const [apprenant, prospect, entreprise] = await Promise.all([
    d.learnerId ? prisma.learner.findUnique({ where: { id: d.learnerId }, select: { email: true } }) : null,
    d.prospectId ? prisma.prospect.findUnique({ where: { id: d.prospectId }, select: { email: true } }) : null,
    d.companyId ? prisma.company.findUnique({ where: { id: d.companyId }, select: { email: true } }) : null,
  ]);
  return apprenant?.email ?? prospect?.email ?? entreprise?.email ?? null;
}

/// PDF du devis, joint à la relance quand Henrri le fournit.
export async function pdfDevis(henrriId: number): Promise<Uint8Array | null> {
  try {
    const { downloadUrl } = await henrriFetch<{ downloadUrl: string }>(`/v1/documents/${henrriId}/pdf/url`, { method: "POST" });
    return await henrriTelecharger(downloadUrl);
  } catch {
    return null;
  }
}
