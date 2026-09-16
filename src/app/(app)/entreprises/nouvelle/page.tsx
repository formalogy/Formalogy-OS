import Link from "next/link";

import { FormulaireEntreprise } from "@/app/(app)/entreprises/nouvelle/formulaire";
import { exigerRole } from "@/lib/session";

export default async function PageNouvelleEntreprise() {
  await exigerRole("ADMIN", "GESTIONNAIRE");

  return (
    <>
      <header className="mb-6">
        <Link
          href="/entreprises"
          className="text-[12.5px] font-semibold text-accent-fort hover:underline"
        >
          ← Entreprises
        </Link>
        <h1 className="mt-2 text-[22px] font-extrabold tracking-tight">
          Nouvelle entreprise
        </h1>
      </header>

      <FormulaireEntreprise />
    </>
  );
}
