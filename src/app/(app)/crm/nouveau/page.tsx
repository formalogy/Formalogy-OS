import Link from "next/link";

import { FormulaireProspect } from "@/app/(app)/crm/nouveau/formulaire";
import { exigerRole } from "@/lib/session";

export default async function PageNouveauProspect() {
  await exigerRole("ADMIN", "GESTIONNAIRE");

  return (
    <>
      <header className="mb-6">
        <Link href="/crm" className="text-[12.5px] font-semibold text-accent-fort hover:underline">
          ← CRM
        </Link>
        <h1 className="mt-2 text-[22px] font-extrabold tracking-tight">Nouveau prospect</h1>
      </header>

      <FormulaireProspect />
    </>
  );
}
