"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { signIn } from "@/lib/auth-client";

export default function PageConnexion() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function soumettre(evenement: React.FormEvent) {
    evenement.preventDefault();
    setErreur(null);
    setEnCours(true);

    const { error } = await signIn.email({ email, password: motDePasse });

    if (error) {
      // Message volontairement identique quelle que soit la cause : indiquer
      // qu'un email existe mais que le mot de passe est faux renseignerait
      // un attaquant sur les comptes valides.
      setErreur("Email ou mot de passe incorrect.");
      setEnCours(false);
      return;
    }

    router.push("/tableau-de-bord");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <h1 className="text-2xl font-extrabold tracking-tight">Formalogy OS</h1>
          <p className="mt-1 text-sm text-texte-doux">Centre de pilotage</p>
        </div>

        <form
          onSubmit={soumettre}
          className="rounded-xl border border-bordure bg-surface p-6 shadow-sm"
        >
          <label htmlFor="email" className="block text-sm font-semibold">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-bordure bg-surface px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-pale"
          />

          <label htmlFor="motDePasse" className="mt-4 block text-sm font-semibold">
            Mot de passe
          </label>
          <input
            id="motDePasse"
            type="password"
            autoComplete="current-password"
            required
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-bordure bg-surface px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-pale"
          />

          {erreur && (
            <p
              role="alert"
              className="mt-4 rounded-lg bg-danger-pale px-3 py-2 text-sm text-danger"
            >
              {erreur}
            </p>
          )}

          <button
            type="submit"
            disabled={enCours}
            className="mt-6 w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition disabled:opacity-60"
          >
            {enCours ? "Connexion…" : "Se connecter"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-texte-tenu">
          Accès réservé à l&apos;équipe Formalogy. Les comptes sont créés par un
          administrateur.
        </p>
      </div>
    </main>
  );
}
