"use client";

import { useFormStatus } from "react-dom";

const CLASSE_CHAMP =
  "mt-1.5 w-full rounded-lg border border-bordure bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent-pale";

type ChampProps = {
  nom: string;
  libelle: string;
  type?: string;
  obligatoire?: boolean;
  valeurParDefaut?: string;
  aide?: string;
  placeholder?: string;
};

export function Champ({
  nom,
  libelle,
  type = "text",
  obligatoire,
  valeurParDefaut,
  aide,
  placeholder,
}: ChampProps) {
  return (
    <div>
      <label htmlFor={nom} className="block text-[12.5px] font-semibold">
        {libelle}
        {!obligatoire && <span className="ml-1 font-normal text-texte-tenu">(facultatif)</span>}
      </label>
      <input
        id={nom}
        name={nom}
        type={type}
        required={obligatoire}
        defaultValue={valeurParDefaut}
        placeholder={placeholder}
        className={CLASSE_CHAMP}
      />
      {aide && <p className="mt-1 text-[11.5px] text-texte-tenu">{aide}</p>}
    </div>
  );
}

export function ChampLong({
  nom,
  libelle,
  valeurParDefaut,
}: {
  nom: string;
  libelle: string;
  valeurParDefaut?: string;
}) {
  return (
    <div>
      <label htmlFor={nom} className="block text-[12.5px] font-semibold">
        {libelle}
        <span className="ml-1 font-normal text-texte-tenu">(facultatif)</span>
      </label>
      <textarea
        id={nom}
        name={nom}
        rows={3}
        defaultValue={valeurParDefaut}
        className={CLASSE_CHAMP}
      />
    </div>
  );
}

type ChampListeProps = {
  nom: string;
  libelle: string;
  options: { valeur: string; libelle: string }[];
  valeurParDefaut?: string;
};

export function ChampListe({ nom, libelle, options, valeurParDefaut }: ChampListeProps) {
  return (
    <div>
      <label htmlFor={nom} className="block text-[12.5px] font-semibold">
        {libelle}
      </label>
      <select
        // React réinitialise le formulaire après chaque envoi. Pour un <select>,
        // il reprend alors sa toute première valeur, et non celle qui vient
        // d'être renvoyée après une erreur. La clé force sa reconstruction
        // avec la bonne valeur.
        key={valeurParDefaut}
        id={nom}
        name={nom}
        defaultValue={valeurParDefaut}
        className={CLASSE_CHAMP}
      >
        {options.map((option) => (
          <option key={option.valeur} value={option.valeur}>
            {option.libelle}
          </option>
        ))}
      </select>
    </div>
  );
}

export function BoutonEnvoyer({ libelle }: { libelle: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white transition disabled:opacity-60"
    >
      {pending ? "Enregistrement…" : libelle}
    </button>
  );
}

export function MessageErreur({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg bg-danger-pale px-3 py-2 text-[12.5px] text-danger">
      {message}
    </p>
  );
}
