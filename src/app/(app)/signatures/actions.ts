"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { formaterTaille } from "@/lib/documents-libelles";
import { journaliser } from "@/lib/journal";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";
import {
  creerAvecReference,
  enregistrerDocumentSigne,
  SignatureDejaTraitee,
  type FichierPdf,
} from "@/lib/signatures/enregistrement";
import { NOMBRE_MAX_SIGNATAIRES, type Signataire } from "@/lib/signatures/libelles";
import { releverBoite } from "@/lib/signatures/boite-mail";
import { StockageNonConfigure } from "@/lib/stockage";

export type EtatFormulaire = { erreur?: string; valeurs?: Record<string, string> };

const TAILLE_MAX = 15 * 1024 * 1024;

function rafraichir(documentId: string) {
  revalidatePath(`/documents/${documentId}`);
  revalidatePath("/signatures");
  revalidatePath("/sessions", "layout");
}

/// Crée la référence de signature d'un document. L'envoi lui-même se fait
/// ensuite depuis le site BoldSign, avec cette référence dans le titre.
export async function preparerSignature(_precedent: EtatFormulaire, donnees: FormData): Promise<EtatFormulaire> {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");
  const valeurs = Object.fromEntries([...donnees.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;
  const documentId = valeurs.documentId ?? "";

  const signataires: Signataire[] = [];
  for (let i = 0; i < NOMBRE_MAX_SIGNATAIRES; i++) {
    const nom = (valeurs[`nom_${i}`] ?? "").trim();
    const email = (valeurs[`email_${i}`] ?? "").trim().toLowerCase();
    if (!nom && !email) continue;
    if (!nom || !email) return { erreur: `Signataire ${i + 1} : indiquez le nom et l'email.`, valeurs };
    if (!z.email().safeParse(email).success) return { erreur: `Signataire ${i + 1} : l'adresse email n'est pas valide.`, valeurs };
    signataires.push({ nom, email });
  }
  if (signataires.length === 0) return { erreur: "Indiquez au moins un signataire.", valeurs };
  if (new Set(signataires.map((s) => s.email)).size !== signataires.length) {
    return { erreur: "Le même email apparaît deux fois.", valeurs };
  }

  const document = await prisma.document.findFirst({
    where: { id: documentId, deletedAt: null },
    include: { versions: { orderBy: { numero: "desc" }, take: 1 } },
  });
  if (!document) return { erreur: "Document introuvable.", valeurs };
  const version = document.versions[0];
  if (!version) return { erreur: "Ce document n'a aucun fichier à faire signer.", valeurs };

  const enCours = await prisma.signatureRequest.findFirst({
    where: { documentId, statut: { in: ["A_ENVOYER", "ENVOYEE"] } },
  });
  if (enCours) return { erreur: `Une signature est déjà en cours pour ce document (${enCours.reference}).`, valeurs };

  const demande = await creerAvecReference((reference) =>
    prisma.signatureRequest.create({
      data: { reference, documentId, versionSourceId: version.id, signataires, createdById: utilisateur.id },
    }),
  );

  await journaliser({
    action: "signature.prepared",
    summary: `Signature préparée (${demande.reference}) : ${document.nom}`,
    entityType: "Document",
    entityId: documentId,
    userId: utilisateur.id,
    metadata: { reference: demande.reference, signataires: signataires.length },
  });

  rafraichir(documentId);
  return {};
}

export async function marquerSignatureEnvoyee(donnees: FormData): Promise<void> {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");
  const id = String(donnees.get("id") ?? "");
  const r = await prisma.signatureRequest.updateMany({
    where: { id, statut: "A_ENVOYER" },
    data: { statut: "ENVOYEE", envoyeeAt: new Date() },
  });
  if (r.count === 0) return;
  const demande = await prisma.signatureRequest.findUniqueOrThrow({ where: { id }, include: { document: { select: { nom: true } } } });
  await journaliser({
    action: "signature.sent",
    summary: `Document envoyé à la signature (${demande.reference}) : ${demande.document.nom}`,
    entityType: "Document",
    entityId: demande.documentId,
    userId: utilisateur.id,
  });
  rafraichir(demande.documentId);
}

export async function annulerSignature(donnees: FormData): Promise<void> {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");
  const id = String(donnees.get("id") ?? "");
  const r = await prisma.signatureRequest.updateMany({
    where: { id, statut: { in: ["A_ENVOYER", "ENVOYEE"] } },
    data: { statut: "ANNULEE", annuleeAt: new Date() },
  });
  if (r.count === 0) return;
  const demande = await prisma.signatureRequest.findUniqueOrThrow({ where: { id }, include: { document: { select: { nom: true } } } });
  await journaliser({
    action: "signature.cancelled",
    summary: `Signature annulée (${demande.reference}) : ${demande.document.nom}`,
    entityType: "Document",
    entityId: demande.documentId,
    userId: utilisateur.id,
  });
  rafraichir(demande.documentId);
}

async function lirePdf(entree: FormDataEntryValue | null, libelle: string, obligatoire: boolean): Promise<FichierPdf | string | undefined> {
  if (!(entree instanceof File) || entree.size === 0) return obligatoire ? `Choisissez ${libelle}.` : undefined;
  if (entree.size > TAILLE_MAX) return `${libelle} dépasse ${formaterTaille(TAILLE_MAX)}.`;
  if (!entree.name.toLowerCase().endsWith(".pdf")) return `${libelle} doit être un PDF.`;
  return { nom: entree.name, octets: new Uint8Array(await entree.arrayBuffer()) };
}

/// Dépôt manuel : quand l'email de BoldSign n'a pas pu être rapproché
/// (document trop volumineux, référence oubliée dans le titre…).
export async function deposerDocumentSigne(_precedent: EtatFormulaire, donnees: FormData): Promise<EtatFormulaire> {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");
  const id = String(donnees.get("id") ?? "");

  const signe = await lirePdf(donnees.get("signe"), "le document signé", true);
  if (typeof signe === "string") return { erreur: signe };
  const preuve = await lirePdf(donnees.get("preuve"), "la preuve de signature", false);
  if (typeof preuve === "string") return { erreur: preuve };

  const demande = await prisma.signatureRequest.findUnique({ where: { id } });
  if (!demande) return { erreur: "Demande de signature introuvable." };

  try {
    await enregistrerDocumentSigne({ signatureRequestId: id, signe: signe!, preuve, origine: "MANUEL", userId: utilisateur.id });
  } catch (erreur) {
    if (erreur instanceof SignatureDejaTraitee) return { erreur: "Cette demande est déjà signée ou annulée." };
    if (erreur instanceof StockageNonConfigure) return { erreur: "Le stockage des documents n'est pas configuré." };
    if (erreur instanceof Error && erreur.message.includes("PDF")) return { erreur: erreur.message };
    console.error("Dépôt du document signé impossible :", erreur);
    return { erreur: "Le document n'a pas pu être enregistré. Réessayez dans un instant." };
  }

  rafraichir(demande.documentId);
  return {};
}

/// Un email « à vérifier » dont on s'est occupé à la main disparaît de la liste.
export async function classerEmailEntrant(donnees: FormData): Promise<void> {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");
  const id = String(donnees.get("id") ?? "");
  const r = await prisma.emailEntrant.updateMany({
    where: { id, resultat: "A_VERIFIER" },
    data: { resultat: "IGNORE", motif: `Traité à la main par ${utilisateur.name}` },
  });
  if (r.count > 0) revalidatePath("/signatures");
}

export type EtatReleve = { message?: string; erreur?: string };

/// Relève immédiate de la boîte, sans attendre le passage automatique.
export async function releverBoiteMaintenant(): Promise<EtatReleve> {
  await exigerRole("ADMIN", "GESTIONNAIRE");
  const bilan = await releverBoite();
  if (bilan.erreur) return { erreur: bilan.erreur };
  revalidatePath("/signatures");
  if (bilan.examines === 0) return { message: "Aucun nouvel email de BoldSign." };
  return {
    message: `${bilan.examines} email(s) examiné(s) : ${bilan.rapproches} document(s) signé(s) enregistré(s)${bilan.aVerifier ? `, ${bilan.aVerifier} à vérifier` : ""}.`,
  };
}
