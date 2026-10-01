import Link from "next/link";

import { EditeurModele } from "@/app/(app)/parametres/modeles-emails/[id]/editeur";
import { exigerRole } from "@/lib/session";

/// Nouveau modèle d'email, réservé aux administrateurs. Sa rubrique « Quand
/// l'utiliser » guide l'assistant IA dans le choix du modèle.
export default async function PageNouveauModele() {
  await exigerRole("ADMIN");
  return (
    <>
      <header className="mb-6">
        <Link href="/parametres/modeles-emails" className="text-[12.5px] font-semibold text-accent-fort hover:underline">
          ← Modèles d&apos;emails
        </Link>
        <h1 className="mt-2 text-[22px] font-extrabold tracking-tight">Nouveau modèle d&apos;email</h1>
      </header>
      <EditeurModele lectureSeule={false} initial={{ id: "", nom: "", description: "", sujet: "", corps: "", actif: true }} />
    </>
  );
}
