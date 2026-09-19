"use client";

import { useActionState, useState } from "react";

import {
  changerRoleUtilisateur,
  desactiverUtilisateur,
  reactiverUtilisateur,
  reinitialiserMotDePasse,
  type EtatAcces,
} from "@/app/(app)/parametres/utilisateurs/actions";

const jour = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Paris" });

type Props = {
  id: string;
  nom: string;
  email: string;
  role: "ADMIN" | "GESTIONNAIRE";
  actif: boolean;
  dernierConnexionAt: Date | null;
  estMoi: boolean;
};

export function LigneUtilisateur({ id, nom, email, role, actif, dernierConnexionAt, estMoi }: Props) {
  const [reset, setReset] = useState(false);
  const [etatReset, envoyerReset] = useActionState<EtatAcces, FormData>(reinitialiserMotDePasse, {});
  const [erreur, setErreur] = useState<string>();

  const changerRole = async (nouveauRole: string) => {
    setErreur(undefined);
    const fd = new FormData();
    fd.set("id", id);
    fd.set("role", nouveauRole);
    const r = await changerRoleUtilisateur(fd);
    if (r.erreur) setErreur(r.erreur);
  };

  const desactiver = async () => {
    if (!confirm(`Désactiver le compte de ${nom} ? Il sera immédiatement déconnecté.`)) return;
    setErreur(undefined);
    const fd = new FormData();
    fd.set("id", id);
    const r = await desactiverUtilisateur(fd);
    if (r.erreur) setErreur(r.erreur);
  };

  return (
    <li className="flex flex-col gap-2 border-t border-bordure-douce py-3 first:border-t-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold">{nom}</span>
            {estMoi && <span className="rounded-full bg-bordure-douce px-1.5 py-px text-[10.5px] text-texte-tenu">vous</span>}
            {!actif && <span className="rounded-full bg-surface-creuse px-1.5 py-px text-[10.5px] font-semibold text-texte-tenu">Désactivé</span>}
          </div>
          <div className="text-[12px] text-texte-tenu">
            {email} · {dernierConnexionAt ? `dernière connexion le ${jour.format(dernierConnexionAt)}` : "jamais connecté"}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={role}
            disabled={estMoi}
            onChange={(e) => changerRole(e.target.value)}
            aria-label={`Rôle de ${nom}`}
            title={estMoi ? "Vous ne pouvez pas changer votre propre rôle" : undefined}
            className="cursor-pointer rounded-lg border border-bordure bg-surface px-2.5 py-1.5 text-[12.5px] font-semibold outline-none focus:ring-2 focus:ring-accent-pale disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="GESTIONNAIRE">Gestionnaire</option>
            <option value="ADMIN">Administrateur</option>
          </select>
          {actif ? (
            <>
              <button type="button" onClick={() => setReset(!reset)} className="rounded-lg border border-bordure bg-surface px-2.5 py-1.5 text-[12px] font-semibold">
                Nouveau mot de passe
              </button>
              {!estMoi && (
                <button type="button" onClick={desactiver} className="rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-texte-tenu hover:bg-danger-pale hover:text-danger">
                  Désactiver
                </button>
              )}
            </>
          ) : (
            <form action={reactiverUtilisateur}>
              <input type="hidden" name="id" value={id} />
              <button type="submit" className="rounded-lg border border-bordure bg-surface px-2.5 py-1.5 text-[12px] font-semibold">
                Réactiver
              </button>
            </form>
          )}
        </div>
      </div>

      {erreur && <p role="alert" className="rounded-lg bg-danger-pale px-3 py-2 text-[12px] text-danger">{erreur}</p>}

      {reset && (
        <form action={envoyerReset} className="rounded-lg bg-surface-creuse p-3">
          {etatReset.motDePasse ? (
            <div role="status" className="text-[12.5px]">
              <p className="font-semibold text-succes">Nouveau mot de passe généré :</p>
              <p className="mt-1 select-all font-mono font-semibold">{etatReset.motDePasse}</p>
              <p className="mt-1 text-[11.5px] text-texte-doux">
                Transmettez-le à {nom}. Il ne s&apos;affichera plus jamais ; {nom} a été déconnecté(e) partout.
              </p>
              <button type="button" onClick={() => setReset(false)} className="mt-2 rounded-lg border border-bordure bg-surface px-2.5 py-1 text-[11.5px] font-semibold">
                Fermer
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <input type="hidden" name="id" value={id} />
              <p className="text-[12.5px] text-texte-doux">
                Générer un nouveau mot de passe pour {nom} ? {nom} sera déconnecté(e) de tous ses appareils.
              </p>
              <button type="submit" className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-[12px] font-semibold text-white">
                Confirmer
              </button>
            </div>
          )}
        </form>
      )}
    </li>
  );
}
