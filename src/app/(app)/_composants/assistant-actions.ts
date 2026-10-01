"use server";

import { createHash, randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { enregistrerPresence } from "@/app/(app)/emargements/actions";
import { changerStatutSession, inscrireApprenant, piloterDeroulementSession } from "@/app/(app)/sessions/actions";
import { creerFicheApprenant, schemaApprenant } from "@/lib/apprenants-creation";
import { emailDepuisModele } from "@/lib/assistant/emails";
import { lireFichierAssistant } from "@/lib/assistant/fichiers";
import { schemaProposition } from "@/lib/assistant/propositions";
import { cheminStockage } from "@/lib/documents-depot";
import { envoyerEmail } from "@/lib/emails/envoi";
import { assainirChampsRiches, referenceDejaPrise, schemaFormation } from "@/lib/formations-creation";
import { journaliser } from "@/lib/journal";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";
import { creerSessionBrouillon, schemaSession } from "@/lib/sessions-creation";
import { stockage } from "@/lib/stockage";

export type ResultatProposition = { erreur?: string; succes?: string; lien?: string };

function formulaire(valeurs: Record<string, string | undefined>): FormData {
  const f = new FormData();
  for (const [cle, valeur] of Object.entries(valeurs)) if (valeur !== undefined) f.set(cle, valeur);
  return f;
}

/// Exécute une proposition de l'assistant IA que l'utilisateur vient de
/// valider. Mêmes contrôles que les formulaires : rôle, saisie, règles
/// métier (places, payeur, jour d'absence…) ; c'est le même code qui agit.
export async function executerProposition(brute: unknown): Promise<ResultatProposition> {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");
  const r = schemaProposition.safeParse(brute);
  if (!r.success) return { erreur: "Proposition invalide." };
  const p = r.data;

  const tracer = (resume: string) =>
    journaliser({ action: "assistant.validated", summary: `Assistant IA — ${resume}`, userId: utilisateur.id, metadata: { proposition: p } });

  switch (p.type) {
    case "APPRENANT": {
      const a = schemaApprenant.safeParse({ ...p.apprenant, statut: "PROSPECT" });
      if (!a.success) return { erreur: a.error.issues[0]?.message ?? "Fiche invalide." };
      const apprenant = await creerFicheApprenant(a.data, utilisateur.id);
      revalidatePath("/apprenants");
      await tracer(`fiche créée pour ${apprenant.prenom} ${apprenant.nom}`);
      const lien = `/apprenants/${apprenant.id}`;
      if (!p.inscription) return { succes: `Fiche de ${apprenant.prenom} ${apprenant.nom} créée.`, lien };
      const i = await inscrireApprenant({}, formulaire({ ...p.inscription, learnerId: apprenant.id }));
      if (i.erreur) return { erreur: `Fiche créée, mais l'inscription a échoué : ${i.erreur}`, lien };
      return { succes: `Fiche de ${apprenant.prenom} ${apprenant.nom} créée et inscription faite.`, lien };
    }
    case "INSCRIPTION": {
      const i = await inscrireApprenant({}, formulaire({ ...p.inscription, learnerId: p.learnerId }));
      if (i.erreur) return { erreur: i.erreur };
      await tracer("inscription faite");
      return { succes: "Inscription faite.", lien: `/sessions/${p.inscription.sessionId}` };
    }
    case "SESSION": {
      const s = schemaSession.safeParse(p);
      if (!s.success) return { erreur: s.error.issues[0]?.message ?? "Session invalide." };
      const cree = await creerSessionBrouillon(s.data, utilisateur.id);
      if ("erreur" in cree) return { erreur: cree.erreur };
      revalidatePath("/sessions");
      revalidatePath("/planning");
      await tracer(`session ${cree.session.numero} créée`);
      return { succes: `Session ${cree.session.numero} créée en brouillon.`, lien: `/sessions/${cree.session.id}` };
    }
    case "ABSENCE": {
      const e = await enregistrerPresence(
        formulaire({ sessionId: p.sessionId, learnerId: p.learnerId, jour: p.jour, creneau: p.creneau, statut: p.justifiee ? "ABSENT_JUSTIFIE" : "ABSENT" }),
      );
      if (e.erreur) return { erreur: e.erreur };
      await tracer("absence signalée");
      return { succes: "Absence enregistrée.", lien: `/sessions/${p.sessionId}` };
    }
    case "EMAIL": {
      let e;
      try {
        e = await emailDepuisModele(p);
      } catch (erreur) {
        return { erreur: erreur instanceof Error ? erreur.message : "Email impossible à préparer." };
      }
      const email = await envoyerEmail({
        destinataire: e.destinataire,
        sujet: e.sujet,
        corps: e.corps,
        corpsJournal: e.corpsJournal,
        templateId: e.modele.id,
        learnerId: e.apprenant.id,
        companyId: e.apprenant.companyId ?? undefined,
        sessionId: p.sessionId,
        createdById: utilisateur.id,
      });
      await tracer(`email « ${e.modele.nom} » à ${e.apprenant.prenom} ${e.apprenant.nom} (${email.statut === "SIMULE" ? "simulé" : email.statut === "ECHEC" ? "en échec" : "envoyé"})`);
      revalidatePath(`/apprenants/${e.apprenant.id}`);
      const lien = `/apprenants/${e.apprenant.id}`;
      if (email.statut === "ECHEC") return { erreur: `L'email n'est pas parti : ${email.erreur}`, lien };
      return { succes: email.statut === "SIMULE" ? "Email enregistré (simulation : l'envoi réel n'est pas activé)." : "Email envoyé.", lien };
    }
    case "PROGRAMME": {
      if (p.trainerId && !(await prisma.trainer.findFirst({ where: { id: p.trainerId, deletedAt: null } }))) {
        return { erreur: "Ce formateur n'existe plus." };
      }
      const typeProgramme = await prisma.documentType.findUnique({ where: { code: "PROGRAMME" } });
      if (!typeProgramme) return { erreur: "Le type de document « Programme » manque." };
      let octets: Uint8Array;
      try {
        octets = await lireFichierAssistant(p.fichierId);
      } catch {
        return { erreur: "Le PDF n'est plus disponible : joignez-le de nouveau à l'assistant." };
      }

      // La fiche formation : celle qui existe, ou une nouvelle en brouillon,
      // avec les contrôles du formulaire (référence unique, nombres…).
      let formation = p.formationId ? await prisma.formation.findFirst({ where: { id: p.formationId, deletedAt: null } }) : null;
      if (p.formationId && !formation) return { erreur: "Cette formation n'existe plus." };
      if (!formation) {
        if (!p.formation) return { erreur: "Aucune fiche formation à créer." };
        const f = schemaFormation.safeParse({ ...p.formation, statut: "BROUILLON", categoryId: "" });
        if (!f.success) return { erreur: f.error.issues[0]?.message ?? "Fiche formation invalide." };
        const doublon = await referenceDejaPrise(f.data.reference);
        if (doublon) return { erreur: `La référence ${f.data.reference} est déjà utilisée par « ${doublon.titre} » : demandez une autre référence à l'assistant.` };
        const { categoryId, ...reste } = assainirChampsRiches(f.data);
        formation = await prisma.formation.create({ data: { ...reste, categoryId: categoryId ?? null, createdById: utilisateur.id } });
        await journaliser({
          action: "formation.created",
          summary: `Formation ajoutée au catalogue : ${formation.titre} (${formation.reference})`,
          entityType: "Formation",
          entityId: formation.id,
          userId: utilisateur.id,
        });
      }

      // Le PDF devient le programme du formateur (proposé sur ses sessions).
      const documentId = randomUUID();
      const chemin = cheminStockage(documentId, 1, "pdf");
      await stockage().deposer(chemin, octets, "application/pdf");
      try {
        await prisma.document.create({
          data: {
            id: documentId,
            nom: p.nom,
            typeId: typeProgramme.id,
            categorie: typeProgramme.categorie,
            formationId: formation.id,
            trainerId: p.trainerId ?? null,
            createdById: utilisateur.id,
            versions: {
              create: {
                numero: 1,
                cheminStockage: chemin,
                nomFichier: p.nomFichier,
                typeMime: "application/pdf",
                taille: octets.byteLength,
                empreinte: createHash("sha256").update(octets).digest("hex"),
                createdById: utilisateur.id,
              },
            },
          },
        });
      } catch (erreur) {
        await stockage().supprimer([chemin]).catch(() => undefined);
        throw erreur;
      }
      await stockage().supprimer([`assistant/${p.fichierId}.pdf`]).catch(() => undefined);

      revalidatePath("/formations");
      if (p.trainerId) revalidatePath(`/formateurs/${p.trainerId}`);
      await tracer(`programme « ${p.nom} » rangé (formation ${formation.reference})`);
      return {
        succes: p.formationId ? `Programme « ${p.nom} » rangé.` : `Fiche « ${formation.titre} » créée en brouillon et programme rangé.`,
        lien: `/formations/${formation.id}`,
      };
    }
    case "DEROULEMENT": {
      const lien = `/sessions/${p.sessionId}`;
      if (p.operation === "annuler") {
        await changerStatutSession(formulaire({ id: p.sessionId, statut: "ANNULEE" }));
        await tracer("session annulée");
        return { succes: "Session annulée.", lien };
      }
      const d = await piloterDeroulementSession({}, formulaire({ id: p.sessionId, operation: p.operation }));
      if (d.erreur) return { erreur: d.erreur };
      await tracer(p.operation === "suspendre" ? "déroulement suspendu" : "déroulement repris");
      return { succes: d.succes ?? "C'est fait.", lien };
    }
  }
}
