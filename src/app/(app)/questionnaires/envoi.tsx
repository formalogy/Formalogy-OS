"use client";

import type { TypeQuestionnaire } from "@prisma/client";
import { useActionState, useState } from "react";

import { BoutonEnvoyer, MessageErreur } from "@/app/(app)/_composants/formulaire";
import { envoyerQuestionnaire, type EtatEnvoi } from "@/app/(app)/questionnaires/actions";
import { LIBELLE_TYPE_QUESTIONNAIRE } from "@/lib/questionnaires-questions";

export type SessionEnvoi = {
  id: string;
  libelle: string;
  trainerId: string | null;
  trainerNom: string | null;
  apprenants: { id: string; libelle: string }[];
};

type Props = {
  sessions: SessionEnvoi[];
  formateurs: { id: string; libelle: string }[];
  dossiers: { id: string; libelle: string }[];
};

const TYPES: TypeQuestionnaire[] = ["POSITIONNEMENT", "FROID", "CHAUD_FORMATEUR", "FINANCEUR", "SATISFACTION_FORMATEUR"];

const CLASSE_CHAMP =
  "mt-1.5 w-full rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent-pale";

export function EnvoiQuestionnaire({ sessions, formateurs, dossiers }: Props) {
  const [etat, envoyer] = useActionState<EtatEnvoi, FormData>(envoyerQuestionnaire, {});
  const [type, setType] = useState<TypeQuestionnaire>("POSITIONNEMENT");
  const [sessionId, setSessionId] = useState("");

  const versApprenant = type === "POSITIONNEMENT" || type === "FROID";
  const versFormateurDeSession = type === "CHAUD_FORMATEUR";
  const avecSession = versApprenant || versFormateurDeSession;
  // Pour un questionnaire formateur de fin de session, le destinataire n'est
  // pas à choisir : c'est le formateur qui a animé la session.
  const session = sessions.find((s) => s.id === sessionId);

  return (
    <form action={envoyer} className="rounded-xl border border-bordure bg-surface p-5 shadow-sm">
      <h2 className="text-[15px] font-bold">Envoyer un questionnaire</h2>
      <p className="mb-4 mt-1 text-[12.5px] text-texte-doux">
        Le destinataire reçoit un lien personnel, valable soixante jours, utilisable une seule fois.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="type" className="block text-[12.5px] font-semibold">
            Type de questionnaire
          </label>
          <select
            id="type"
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value as TypeQuestionnaire)}
            className={CLASSE_CHAMP}
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {LIBELLE_TYPE_QUESTIONNAIRE[t]}
              </option>
            ))}
          </select>
        </div>

        {avecSession && (
          <div>
            <label htmlFor="sessionId" className="block text-[12.5px] font-semibold">
              Session
            </label>
            <select
              id="sessionId"
              name="sessionId"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              className={CLASSE_CHAMP}
            >
              <option value="">Choisir…</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.libelle}
                </option>
              ))}
            </select>
          </div>
        )}

        {versApprenant && (
          <div>
            <label htmlFor="learnerId" className="block text-[12.5px] font-semibold">
              Apprenant
            </label>
            <select id="learnerId" name="learnerId" disabled={!session} className={CLASSE_CHAMP}>
              <option value="">{session ? "Choisir…" : "Choisissez d'abord une session"}</option>
              {(session?.apprenants ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.libelle}
                </option>
              ))}
            </select>
            {session && session.apprenants.length === 0 && (
              <p className="mt-1 text-[11.5px] text-texte-tenu">Aucun apprenant inscrit à cette session.</p>
            )}
          </div>
        )}

        {versFormateurDeSession && (
          <div>
            <p className="block text-[12.5px] font-semibold">Formateur</p>
            <p className="mt-2.5 text-[13px]">
              {session ? session.trainerNom ?? "Aucun formateur sur cette session" : "Choisissez d'abord une session"}
            </p>
            {session?.trainerId && <input type="hidden" name="trainerId" value={session.trainerId} />}
          </div>
        )}

        {type === "SATISFACTION_FORMATEUR" && (
          <div>
            <label htmlFor="trainerId" className="block text-[12.5px] font-semibold">
              Formateur
            </label>
            <select id="trainerId" name="trainerId" className={CLASSE_CHAMP}>
              <option value="">Choisir…</option>
              {formateurs.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.libelle}
                </option>
              ))}
            </select>
          </div>
        )}

        {type === "FINANCEUR" && (
          <div>
            <label htmlFor="dossierFinancementId" className="block text-[12.5px] font-semibold">
              Dossier de prise en charge
            </label>
            <select id="dossierFinancementId" name="dossierFinancementId" className={CLASSE_CHAMP}>
              <option value="">Choisir…</option>
              {dossiers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.libelle}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11.5px] text-texte-tenu">
              L&apos;email part à l&apos;adresse enregistrée sur le dossier.
            </p>
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <BoutonEnvoyer libelle="Envoyer" />
        <MessageErreur message={etat.erreur} />
        {etat.succes && <span className="text-[12.5px] font-semibold text-succes">{etat.succes}</span>}
      </div>
    </form>
  );
}
