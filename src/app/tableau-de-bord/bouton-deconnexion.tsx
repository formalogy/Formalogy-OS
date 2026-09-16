"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { signOut } from "@/lib/auth-client";

export function BoutonDeconnexion() {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);

  return (
    <button
      type="button"
      disabled={enCours}
      onClick={async () => {
        setEnCours(true);
        await signOut();
        router.push("/connexion");
        router.refresh();
      }}
      className="shrink-0 rounded-lg border border-bordure bg-surface px-3 py-2 text-sm font-semibold transition disabled:opacity-60"
    >
      {enCours ? "…" : "Se déconnecter"}
    </button>
  );
}
