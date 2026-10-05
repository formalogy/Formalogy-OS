"use client";

import { IconSearch } from "@tabler/icons-react";
import { useState } from "react";
import { useFormStatus } from "react-dom";

import { creerSessionCatalogue } from "@/app/(app)/sessions/actions";

type Formation = {
  id: string;
  titre: string;
  reference: string;
  categorie: string | null;
  modalite: string;
  duree: string;
  certification: string | null;
  formateurs: string[];
};

/// Recherche sans accents ni majuscules : « excel » trouve « EXCEL Débutant ».
const simplifier = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

function Choisir() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="shrink-0 rounded-lg bg-accent px-3.5 py-2 text-[12.5px] font-semibold text-white disabled:opacity-60">
      {pending ? "Création…" : "Créer la session"}
    </button>
  );
}

/// Catalogue où l'on choisit la formation d'une nouvelle session.
export function CatalogueSessions({
  formations,
  rechercheInitiale,
  formateur,
  entreprise,
  apprenant,
}: {
  formations: Formation[];
  rechercheInitiale: string;
  formateur: string;
  entreprise: string;
  apprenant: string;
}) {
  const [recherche, setRecherche] = useState(rechercheInitiale);
  const mots = simplifier(recherche).split(/\s+/).filter(Boolean);
  const visibles = formations.filter((f) => {
    const texte = simplifier([f.titre, f.reference, f.categorie ?? "", f.modalite, ...f.formateurs].join(" "));
    return mots.every((m) => texte.includes(m));
  });

  return (
    <div className="max-w-4xl">
      <label className="relative block">
        <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-texte-tenu" aria-hidden="true" />
        <input
          type="search"
          autoFocus
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher une formation : titre, référence, catégorie, formateur…"
          aria-label="Rechercher une formation"
          className="w-full rounded-xl border border-bordure bg-surface py-2.5 pl-9 pr-3 text-[13.5px] outline-none focus:border-accent focus:ring-2 focus:ring-accent-pale"
        />
      </label>
      <p className="mb-2 mt-2 text-[12px] text-texte-tenu">
        {visibles.length} formation{visibles.length > 1 ? "s" : ""}
        {mots.length > 0 && ` sur ${formations.length}`}
      </p>

      {visibles.length === 0 ? (
        <p className="rounded-xl border border-dashed border-bordure p-6 text-center text-[13px] text-texte-doux">
          Aucune formation ne correspond. Vérifiez l&apos;orthographe, ou ajoutez-la au catalogue.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visibles.map((f) => (
            <li key={f.id}>
              <form action={creerSessionCatalogue} className="flex flex-wrap items-center gap-3 rounded-xl border border-bordure bg-surface px-4 py-3 shadow-sm hover:border-accent">
                <input type="hidden" name="formationId" value={f.id} />
                {formateur && <input type="hidden" name="formateur" value={formateur} />}
                {entreprise && <input type="hidden" name="entreprise" value={entreprise} />}
                {apprenant && <input type="hidden" name="apprenant" value={apprenant} />}
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold">{f.titre}</div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-texte-tenu">
                    <span className="font-mono">{f.reference}</span>
                    <span>{f.modalite}</span>
                    <span>{f.duree}</span>
                    {f.certification && <span className="font-semibold text-accent-fort">{f.certification}</span>}
                    {f.categorie && <span>{f.categorie}</span>}
                    <span>{f.formateurs.length ? `Formateur : ${f.formateurs.join(", ")}` : "Formateur à choisir"}</span>
                  </div>
                </div>
                <Choisir />
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
