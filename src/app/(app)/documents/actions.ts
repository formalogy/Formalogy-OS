"use server";

import { createHash, randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  CATEGORIES_DOCUMENT,
  FORMATS_ACCEPTES,
  formaterTaille,
  LIBELLE_STATUT_DOCUMENT,
  signatureConforme,
  STATUTS_DOCUMENT,
  TAILLE_MAX_OCTETS,
} from "@/lib/documents-libelles";
import { journaliser } from "@/lib/journal";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";
import { stockage, StockageNonConfigure } from "@/lib/stockage";

export type EtatFormulaire = {
  erreur?: string;
  valeurs?: Record<string, string>;
};

function saisie(donnees: FormData): Record<string, string> {
  const valeurs: Record<string, string> = {};
  for (const [cle, valeur] of donnees.entries()) {
    if (typeof valeur === "string") valeurs[cle] = valeur;
  }
  return valeurs;
}

const texteFacultatif = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

type FichierVerifie = {
  octets: Uint8Array;
  typeMime: string;
  extension: string;
  nomFichier: string;
  empreinte: string;
};

/// Contrôle un fichier reçu. On ne fait confiance ni au nom, ni au type
/// annoncé par le navigateur : l'extension doit correspondre à un format
/// accepté, et les premiers octets doivent confirmer ce format.
async function verifierFichier(fichier: FormDataEntryValue | null): Promise<FichierVerifie | string> {
  if (!(fichier instanceof File) || fichier.size === 0) return "Choisissez un fichier.";
  if (fichier.size > TAILLE_MAX_OCTETS) {
    return `Le fichier fait ${formaterTaille(fichier.size)} : la taille maximale est de ${formaterTaille(TAILLE_MAX_OCTETS)}.`;
  }

  const extension = fichier.name.split(".").pop()?.toLowerCase() ?? "";
  const typeMime = Object.entries(FORMATS_ACCEPTES).find(([, f]) => f.extensions.includes(extension))?.[0];
  if (!typeMime) {
    return "Format non accepté. Formats possibles : PDF, image (PNG, JPG), Word, Excel, PowerPoint, OpenDocument, CSV, texte.";
  }

  const octets = new Uint8Array(await fichier.arrayBuffer());
  if (!signatureConforme(typeMime, octets)) {
    return `Le contenu du fichier ne correspond pas à son extension « .${extension} ». Le fichier est peut-être endommagé ou mal renommé.`;
  }

  // Le nom d'origine est conservé pour l'affichage et le téléchargement, mais
  // débarrassé des caractères qui pourraient poser problème.
  const nomFichier = fichier.name.replace(/[\\/\u0000-\u001f"]/g, "_").slice(0, 200);

  return {
    octets,
    typeMime,
    extension,
    nomFichier,
    empreinte: createHash("sha256").update(octets).digest("hex"),
  };
}

/// Emplacement de stockage généré par le serveur, jamais dérivé d'une saisie :
/// impossible d'écraser un autre fichier ou de sortir du dossier prévu.
function cheminStockage(documentId: string, numero: number, extension: string) {
  return `${documentId}/v${numero}-${randomUUID()}.${extension}`;
}

function messageStockage(erreur: unknown): string {
  if (erreur instanceof StockageNonConfigure) {
    return "Le stockage des documents n'est pas encore configuré. Il manque la clé Supabase dans le fichier de configuration.";
  }
  console.error("Erreur de stockage :", erreur);
  return "Le fichier n'a pas pu être enregistré dans l'espace de stockage. Réessayez dans un instant.";
}

const schemaDocument = z.object({
  nom: z.string().trim().min(1, "Donnez un nom au document."),
  typeId: texteFacultatif,
  categorie: z.enum(CATEGORIES_DOCUMENT as [string, ...string[]], { message: "Choisissez une catégorie." }),
  statut: z.enum(STATUTS_DOCUMENT as [string, ...string[]]),
  description: texteFacultatif,
  learnerId: texteFacultatif,
  companyId: texteFacultatif,
  sessionId: texteFacultatif,
  formationId: texteFacultatif,
});

export async function deposerDocument(_precedent: EtatFormulaire, donnees: FormData): Promise<EtatFormulaire> {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");

  const champs = Object.fromEntries([...donnees.entries()].filter(([, v]) => typeof v === "string"));
  const resultat = schemaDocument.safeParse(champs);
  if (!resultat.success) {
    return { erreur: resultat.error.issues[0]?.message ?? "Saisie invalide.", valeurs: saisie(donnees) };
  }
  const d = resultat.data;

  // Chaque rattachement doit désigner une fiche existante.
  const [type, apprenant, entreprise, session, formation] = await Promise.all([
    d.typeId ? prisma.documentType.findUnique({ where: { id: d.typeId } }) : null,
    d.learnerId ? prisma.learner.findFirst({ where: { id: d.learnerId, deletedAt: null } }) : null,
    d.companyId ? prisma.company.findFirst({ where: { id: d.companyId, deletedAt: null } }) : null,
    d.sessionId ? prisma.trainingSession.findFirst({ where: { id: d.sessionId, deletedAt: null } }) : null,
    d.formationId ? prisma.formation.findFirst({ where: { id: d.formationId, deletedAt: null } }) : null,
  ]);
  if ((d.typeId && !type) || (d.learnerId && !apprenant) || (d.companyId && !entreprise) || (d.sessionId && !session) || (d.formationId && !formation)) {
    return { erreur: "Un des éléments rattachés n'existe plus. Rechargez la page.", valeurs: saisie(donnees) };
  }

  const fichier = await verifierFichier(donnees.get("fichier"));
  if (typeof fichier === "string") return { erreur: fichier, valeurs: saisie(donnees) };

  const documentId = randomUUID();
  const chemin = cheminStockage(documentId, 1, fichier.extension);

  // Ordre volontaire : le fichier d'abord, la base ensuite. Si l'écriture en
  // base échoue, on retire le fichier pour ne pas laisser d'orphelin.
  try {
    await stockage().deposer(chemin, fichier.octets, fichier.typeMime);
  } catch (erreur) {
    return { erreur: messageStockage(erreur), valeurs: saisie(donnees) };
  }

  try {
    await prisma.document.create({
      data: {
        id: documentId,
        nom: d.nom,
        description: d.description,
        typeId: d.typeId ?? null,
        categorie: d.categorie as never,
        statut: d.statut as never,
        learnerId: d.learnerId ?? null,
        companyId: d.companyId ?? null,
        sessionId: d.sessionId ?? null,
        formationId: d.formationId ?? null,
        createdById: utilisateur.id,
        versions: {
          create: {
            numero: 1,
            cheminStockage: chemin,
            nomFichier: fichier.nomFichier,
            typeMime: fichier.typeMime,
            taille: fichier.octets.byteLength,
            empreinte: fichier.empreinte,
            createdById: utilisateur.id,
          },
        },
      },
    });
  } catch (erreur) {
    await stockage().supprimer([chemin]).catch(() => undefined);
    throw erreur;
  }

  await journaliser({
    action: "document.created",
    summary: `Document ajouté : ${d.nom}${type ? ` (${type.nom})` : ""}`,
    entityType: "Document",
    entityId: documentId,
    userId: utilisateur.id,
    metadata: { empreinte: fichier.empreinte, taille: fichier.octets.byteLength },
  });

  revalidatePath("/documents");
  redirect(`/documents/${documentId}`);
}

export async function deposerNouvelleVersion(_precedent: EtatFormulaire, donnees: FormData): Promise<EtatFormulaire> {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");

  const documentId = String(donnees.get("documentId") ?? "");
  const commentaire = String(donnees.get("commentaire") ?? "").trim() || undefined;

  const document = await prisma.document.findFirst({
    where: { id: documentId, deletedAt: null },
    include: { versions: { orderBy: { numero: "desc" }, take: 1 } },
  });
  if (!document) return { erreur: "Document introuvable." };

  const fichier = await verifierFichier(donnees.get("fichier"));
  if (typeof fichier === "string") return { erreur: fichier };

  const derniere = document.versions[0];
  if (derniere?.empreinte === fichier.empreinte) {
    return { erreur: "Ce fichier est identique à la version actuelle : aucune nouvelle version n'a été créée." };
  }

  const numero = (derniere?.numero ?? 0) + 1;
  const chemin = cheminStockage(document.id, numero, fichier.extension);

  try {
    await stockage().deposer(chemin, fichier.octets, fichier.typeMime);
  } catch (erreur) {
    return { erreur: messageStockage(erreur) };
  }

  try {
    await prisma.documentVersion.create({
      data: {
        documentId: document.id,
        numero,
        cheminStockage: chemin,
        nomFichier: fichier.nomFichier,
        typeMime: fichier.typeMime,
        taille: fichier.octets.byteLength,
        empreinte: fichier.empreinte,
        commentaire,
        createdById: utilisateur.id,
      },
    });
  } catch (erreur) {
    // Deux dépôts simultanés auraient obtenu le même numéro : la contrainte
    // d'unicité en refuse un, dont on retire le fichier.
    await stockage().supprimer([chemin]).catch(() => undefined);
    console.error("Enregistrement de la version impossible :", erreur);
    return { erreur: "Une autre version vient d'être déposée en même temps. Rechargez la page et réessayez." };
  }

  await prisma.document.update({ where: { id: document.id }, data: { updatedAt: new Date() } });

  await journaliser({
    action: "document.version_added",
    summary: `Nouvelle version (v${numero}) du document « ${document.nom} »`,
    entityType: "Document",
    entityId: document.id,
    userId: utilisateur.id,
    metadata: { numero, empreinte: fichier.empreinte },
  });

  revalidatePath(`/documents/${document.id}`);
  return {};
}

export async function changerStatutDocument(donnees: FormData): Promise<void> {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");
  const r = z
    .object({ id: z.string().min(1), statut: z.enum(STATUTS_DOCUMENT as [string, ...string[]]) })
    .safeParse(Object.fromEntries(donnees));
  if (!r.success) return;

  const document = await prisma.document.update({
    where: { id: r.data.id },
    data: { statut: r.data.statut as never },
  });

  await journaliser({
    action: "document.status_changed",
    summary: `Document « ${document.nom} » — statut passé à « ${LIBELLE_STATUT_DOCUMENT[document.statut]} »`,
    entityType: "Document",
    entityId: document.id,
    userId: utilisateur.id,
  });

  revalidatePath(`/documents/${document.id}`);
  revalidatePath("/documents");
}

/// Suppression douce : le document disparaît des listes, mais ses fichiers et
/// ses versions sont conservés. Réservée aux administrateurs.
export async function supprimerDocument(donnees: FormData): Promise<void> {
  const utilisateur = await exigerRole("ADMIN");
  const id = String(donnees.get("id") ?? "");

  const document = await prisma.document.findFirst({ where: { id, deletedAt: null } });
  if (!document) return;

  await prisma.document.update({ where: { id }, data: { deletedAt: new Date() } });

  await journaliser({
    action: "document.deleted",
    summary: `Document supprimé : ${document.nom}`,
    entityType: "Document",
    entityId: document.id,
    userId: utilisateur.id,
  });

  revalidatePath("/documents");
  redirect("/documents");
}
