import Link from "next/link";

import { FormulaireFormateur } from "@/app/(app)/formateurs/formulaire";
import { exigerRole } from "@/lib/session";

export default async function PageNouveauFormateur() {
  await exigerRole("ADMIN", "GESTIONNAIRE");

  return (
    <>
      <header className="mb-6">
        <Link href="/formateurs" className="text-[12.5px] font-semibold text-accent-fort hover:underline">
          ← Formateurs
        </Link>
        <h1 className="mt-2 text-[22px] font-extrabold tracking-tight">Nouveau formateur</h1>
      </header>

      <FormulaireFormateur />
    </>
  );
}
