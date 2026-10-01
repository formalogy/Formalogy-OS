"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { assainirChampsRiches, referenceDejaPrise, schemaFormation } from "@/lib/formations-creation";
import { journaliser } from "@/lib/journal";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";

const euros = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const prixLisible = (prix: number | null) => (prix === null ? "—" : euros.format(prix));

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


export async function creerFormation(
  _precedent: EtatFormulaire,
  donnees: FormData,
): Promise<EtatFormulaire> {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");

  const resultat = schemaFormation.safeParse(Object.fromEntries(donnees));
  if (!resultat.success) {
    return {
      erreur: resultat.error.issues[0]?.message ?? "Saisie invalide.",
      valeurs: saisie(donnees),
    };
  }

  const doublon = await referenceDejaPrise(resultat.data.reference);
  if (doublon) {
    return {
      erreur: `La référence ${resultat.data.reference} est déjà utilisée par « ${doublon.titre} ».`,
      valeurs: saisie(donnees),
    };
  }

  const { categoryId, ...reste } = assainirChampsRiches(resultat.data);
  const formation = await prisma.formation.create({
    data: { ...reste, categoryId: categoryId ?? null, createdById: utilisateur.id },
  });

  await journaliser({
    action: "formation.created",
    summary: `Formation ajoutée au catalogue : ${formation.titre} (${formation.reference})`,
    entityType: "Formation",
    entityId: formation.id,
    userId: utilisateur.id,
  });

  revalidatePath("/formations");
  redirect(`/formations/${formation.id}`);
}

export async function modifierFormation(
  _precedent: EtatFormulaire,
  donnees: FormData,
): Promise<EtatFormulaire> {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");

  const id = String(donnees.get("id") ?? "");
  const existante = await prisma.formation.findFirst({ where: { id, deletedAt: null } });
  if (!existante) {
    return { erreur: "Formation introuvable.", valeurs: saisie(donnees) };
  }

  const resultat = schemaFormation.safeParse(Object.fromEntries(donnees));
  if (!resultat.success) {
    return {
      erreur: resultat.error.issues[0]?.message ?? "Saisie invalide.",
      valeurs: saisie(donnees),
    };
  }

  const doublon = await referenceDejaPrise(resultat.data.reference, id);
  if (doublon) {
    return {
      erreur: `La référence ${resultat.data.reference} est déjà utilisée par « ${doublon.titre} ».`,
      valeurs: saisie(donnees),
    };
  }

  const { categoryId, ...reste } = assainirChampsRiches(resultat.data);
  const formation = await prisma.formation.update({
    where: { id },
    data: { ...reste, categoryId: categoryId ?? null },
  });

  // Le prix est l'information la plus sensible du catalogue : on garde la
  // trace de l'ancienne et de la nouvelle valeur.
  const ancienPrix = existante.prixHT === null ? null : Number(existante.prixHT);
  const nouveauPrix = formation.prixHT === null ? null : Number(formation.prixHT);

  await journaliser({
    action: "formation.updated",
    summary:
      ancienPrix !== nouveauPrix
        ? `Formation modifiée : ${formation.titre} — prix HT ${prixLisible(ancienPrix)} → ${prixLisible(nouveauPrix)}`
        : `Formation modifiée : ${formation.titre}`,
    entityType: "Formation",
    entityId: formation.id,
    userId: utilisateur.id,
    metadata: { ancienPrix, nouveauPrix },
  });

  revalidatePath("/formations");
  revalidatePath(`/formations/${id}`);
  redirect(`/formations/${id}`);
}
