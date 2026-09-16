import type { StatutSession } from "@prisma/client";
import Link from "next/link";

import {
  formaterPeriode,
  LIBELLE_STATUT_SESSION,
  TON_STATUT_SESSION,
} from "@/lib/sessions-libelles";

export type SessionResumee = {
  id: string;
  numero: string;
  dateDebut: Date;
  dateFin: Date;
  statut: StatutSession;
  /// Ce qui distingue les sessions dans ce contexte : l'entreprise sur une
  /// fiche formation, la formation sur une fiche entreprise…
  sousTitre: string;
  titre: string;
};

type Props = {
  titre: string;
  sessions: SessionResumee[];
  /// Lien « Programmer une session », avec pré-remplissage éventuel
  lienCreation?: string;
  messageVide: string;
};

export function ListeSessions({ titre, sessions, lienCreation, messageVide }: Props) {
  return (
    <section className="rounded-xl border border-bordure bg-surface p-5 shadow-sm">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-[14.5px] font-bold">
          {titre} <span className="font-normal text-texte-tenu">({sessions.length})</span>
        </h2>
        {lienCreation && (
          <Link href={lienCreation} className="text-[12.5px] font-semibold text-accent-fort hover:underline">
            Programmer une session
          </Link>
        )}
      </div>

      {sessions.length === 0 ? (
        <p className="text-[12.8px] text-texte-doux">{messageVide}</p>
      ) : (
        <ul>
          {sessions.map((s) => (
            <li key={s.id} className="border-t border-bordure-douce first:border-t-0">
              <Link href={`/sessions/${s.id}`} className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-surface-creuse">
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold">{s.titre}</div>
                  <div className="truncate text-[11.5px] text-texte-tenu">
                    {formaterPeriode(s.dateDebut, s.dateFin)} · {s.sousTitre}
                  </div>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${TON_STATUT_SESSION[s.statut]}`}>
                  {LIBELLE_STATUT_SESSION[s.statut]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
