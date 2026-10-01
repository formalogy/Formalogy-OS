"use server";

import { revalidatePath } from "next/cache";

import { enregistrerPresence } from "@/app/(app)/emargements/actions";
import { changerStatutSession, inscrireApprenant, piloterDeroulementSession } from "@/app/(app)/sessions/actions";
import { creerFicheApprenant, schemaApprenant } from "@/lib/apprenants-creation";
import { schemaProposition } from "@/lib/assistant/propositions";
import { journaliser } from "@/lib/journal";
import { exigerRole } from "@/lib/session";
import { creerSessionBrouillon, schemaSession } from "@/lib/sessions-creation";

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
