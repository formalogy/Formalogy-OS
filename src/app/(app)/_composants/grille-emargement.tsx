"use client";

import type { Creneau, StatutPresence } from "@prisma/client";
import { useState, useTransition } from "react";

import { enregistrerPresence, marquerTousPresents } from "@/app/(app)/emargements/actions";
import { LIBELLE_CRENEAU, LIBELLE_PRESENCE, STATUTS_PRESENCE, TON_PRESENCE } from "@/lib/emargement";

type Props = {
  sessionId: string;
  /// Jours au format AAAA-MM-JJ, avec un libellé court
  jours: { cle: string; libelle: string; passe: boolean }[];
  apprenants: { id: string; nom: string; detail?: string }[];
  /// Clé « learnerId|AAAA-MM-JJ|CRENEAU » → statut
  presences: Record<string, StatutPresence>;
};

const CRENEAUX: Creneau[] = ["MATIN", "APRES_MIDI"];

export function GrilleEmargement({ sessionId, jours, apprenants, presences }: Props) {
  const [valeurs, setValeurs] = useState(presences);
  const [erreur, setErreur] = useState<string>();
  const [enCours, demarrer] = useTransition();

  const donnees = (champs: Record<string, string>) => {
    const fd = new FormData();
    fd.set("sessionId", sessionId);
    for (const [k, v] of Object.entries(champs)) fd.set(k, v);
    return fd;
  };

  const changer = (learnerId: string, jour: string, creneau: Creneau, statut: string) => {
    const cle = `${learnerId}|${jour}|${creneau}`;
    const avant = valeurs[cle];
    // Affichage immédiat, annulé si le serveur refuse.
    setValeurs((v) => {
      const copie = { ...v };
      if (statut) copie[cle] = statut as StatutPresence;
      else delete copie[cle];
      return copie;
    });
    setErreur(undefined);
    demarrer(async () => {
      const r = await enregistrerPresence(donnees({ learnerId, jour, creneau, statut }));
      if (r.erreur) {
        setErreur(r.erreur);
        setValeurs((v) => {
          const copie = { ...v };
          if (avant) copie[cle] = avant;
          else delete copie[cle];
          return copie;
        });
      }
    });
  };

  const tousPresents = (jour: string, creneau: Creneau) => {
    setErreur(undefined);
    demarrer(async () => {
      const r = await marquerTousPresents(donnees({ jour, creneau }));
      if (r.erreur) return setErreur(r.erreur);
      setValeurs((v) => {
        const copie = { ...v };
        for (const a of apprenants) copie[`${a.id}|${jour}|${creneau}`] ??= "PRESENT";
        return copie;
      });
    });
  };

  if (apprenants.length === 0) {
    return <p className="text-[13px] text-texte-doux">Aucun apprenant inscrit : rien à émarger.</p>;
  }

  return (
    <div>
      {erreur && (
        <p role="alert" className="mb-3 rounded-lg bg-danger-pale px-3 py-2 text-[12.5px] text-danger">
          {erreur}
        </p>
      )}
      <div className="overflow-x-auto rounded-xl border border-bordure bg-surface shadow-sm">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="bg-surface-creuse text-[11px] text-texte-tenu">
              <th rowSpan={2} className="sticky left-0 z-10 min-w-[180px] bg-surface-creuse px-3 py-2 text-left font-semibold uppercase tracking-wider">
                Apprenant
              </th>
              {jours.map((j) => (
                <th key={j.cle} colSpan={2} className="whitespace-nowrap border-l border-bordure-douce px-2 py-1.5 text-center font-semibold first-letter:uppercase">
                  {j.libelle}
                </th>
              ))}
            </tr>
            <tr className="bg-surface-creuse text-[10.5px] text-texte-tenu">
              {jours.flatMap((j) =>
                CRENEAUX.map((c) => (
                  <th key={`${j.cle}-${c}`} className="whitespace-nowrap border-l border-bordure-douce px-2 pb-1.5 font-normal">
                    <div>{LIBELLE_CRENEAU[c]}</div>
                    {j.passe && (
                      <button
                        type="button"
                        disabled={enCours}
                        onClick={() => tousPresents(j.cle, c)}
                        className="mt-0.5 text-[10.5px] font-semibold text-accent-fort hover:underline disabled:opacity-50"
                      >
                        Tous présents
                      </button>
                    )}
                  </th>
                )),
              )}
            </tr>
          </thead>
          <tbody>
            {apprenants.map((a) => (
              <tr key={a.id} className="border-t border-bordure-douce">
                <td className="sticky left-0 z-10 bg-surface px-3 py-2">
                  <div className="font-semibold">{a.nom}</div>
                  {a.detail && <div className="text-[11px] text-texte-tenu">{a.detail}</div>}
                </td>
                {jours.flatMap((j) =>
                  CRENEAUX.map((c) => {
                    const statut = valeurs[`${a.id}|${j.cle}|${c}`];
                    return (
                      <td key={`${j.cle}-${c}`} className="border-l border-bordure-douce px-1.5 py-1.5 text-center">
                        {j.passe ? (
                          <select
                            aria-label={`${a.nom}, ${j.libelle}, ${LIBELLE_CRENEAU[c]}`}
                            value={statut ?? ""}
                            onChange={(e) => changer(a.id, j.cle, c, e.target.value)}
                            className={`w-full min-w-[96px] cursor-pointer rounded-md border-0 px-1.5 py-1 text-[11.5px] font-semibold outline-none focus:ring-2 focus:ring-accent-pale ${statut ? TON_PRESENCE[statut] : "bg-surface-creuse text-texte-tenu"}`}
                          >
                            <option value="">Présumé présent</option>
                            {STATUTS_PRESENCE.map((s) => (
                              <option key={s} value={s}>
                                {LIBELLE_PRESENCE[s]}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-[11px] text-texte-tenu">à venir</span>
                        )}
                      </td>
                    );
                  }),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
