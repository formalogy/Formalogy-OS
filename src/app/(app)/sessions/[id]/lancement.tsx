"use client";

import type { StatutSession } from "@prisma/client";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { lancerDeroulementSession, piloterDeroulementSession, type EtatDeroulement } from "@/app/(app)/sessions/actions";

function Bouton({ libelle, enCours, discret }: { libelle: string; enCours: string; discret?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={
        discret
          ? "rounded-lg border border-bordure bg-surface px-3 py-1.5 text-[12.5px] font-semibold text-texte-doux transition hover:border-alerte hover:text-alerte disabled:opacity-60"
          : "rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white transition disabled:opacity-60"
      }
    >
      {pending ? enCours : libelle}
    </button>
  );
}

const jour = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Paris" });

type Props = { sessionId: string; statut: StatutSession; suspenduLe: string | null };

/// Déroulement automatique de la session : le lancer (brouillon), puis le
/// laisser faire. La seule intervention prévue ensuite est l'alerte du client :
/// suspendre, puis reprendre.
export function LancementSession({ sessionId, statut, suspenduLe }: Props) {
  const [lancement, lancer] = useActionState<EtatDeroulement, FormData>(lancerDeroulementSession, {});
  const [pilotage, piloter] = useActionState<EtatDeroulement, FormData>(piloterDeroulementSession, {});

  if (statut === "ANNULEE" || statut === "CLOTUREE") return null;

  if (suspenduLe) {
    return (
      <section className="rounded-xl border border-alerte/50 bg-alerte/8 p-5 shadow-sm">
        <h2 className="text-[14.5px] font-bold text-alerte">Déroulement suspendu depuis le {jour.format(new Date(suspenduLe))}</h2>
        <p className="mb-4 mt-1 text-[12.5px] text-texte-doux">
          Plus rien ne part pour cette session : ni email, ni document, ni changement de statut, ni facture. Faites vos
          corrections (dates, absences, inscrits…), puis reprenez le déroulement : ce qui est dû partira aussitôt.
        </p>
        <form action={piloter} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="id" value={sessionId} />
          <input type="hidden" name="operation" value="reprendre" />
          <Bouton libelle="Reprendre le déroulement" enCours="Reprise…" />
          {pilotage.erreur && <span className="text-[12.5px] text-danger">{pilotage.erreur}</span>}
          {pilotage.succes && <span className="text-[12.5px] font-semibold text-alerte">{pilotage.succes}</span>}
        </form>
      </section>
    );
  }

  if (statut === "BROUILLON") {
    return (
      <section className="rounded-xl border border-accent bg-accent-pale/40 p-5 shadow-sm">
        <h2 className="text-[14.5px] font-bold">Cette session est un brouillon</h2>
        <p className="mb-4 mt-1 text-[12.5px] text-texte-doux">
          Rien ne part tant qu&apos;elle le reste : ni convocation, ni questionnaire, ni convention. Lancez son
          déroulement et l&apos;application s&apos;occupe du reste aux dates prévues — ce qui est déjà dû part
          immédiatement.
        </p>
        <form action={lancer} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="id" value={sessionId} />
          <Bouton libelle="Lancer le déroulement automatique" enCours="Mise en route…" />
          {lancement.erreur && <span className="text-[12.5px] text-danger">{lancement.erreur}</span>}
        </form>
      </section>
    );
  }

  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-succes/40 bg-succes/8 px-5 py-3 shadow-sm">
      <div className="min-w-0">
        <h2 className="text-[14px] font-bold text-succes">Déroulement automatique en cours</h2>
        <p className="mt-0.5 text-[12.5px] text-texte-doux">
          {lancement.succes
            ? lancement.succes.replace("Session en route. ", "")
            : pilotage.succes ?? "Tout part seul aux dates prévues, jusqu'à la facture. En cas de problème, suspendez le déroulement."}
        </p>
      </div>
      <form
        action={piloter}
        onSubmit={(e) => {
          if (!window.confirm("Suspendre le déroulement de cette session ? Plus rien ne partira tant que vous ne l'aurez pas repris.")) {
            e.preventDefault();
          }
        }}
      >
        <input type="hidden" name="id" value={sessionId} />
        <input type="hidden" name="operation" value="suspendre" />
        <Bouton libelle="Suspendre le déroulement" enCours="Suspension…" discret />
      </form>
    </section>
  );
}
