import { notFound } from "next/navigation";

import { ContenuEmargement } from "@/app/(app)/_composants/contenu-emargement";
import { sessionPourEmargement } from "@/lib/emargement-acces";
import { exigerRole } from "@/lib/session";

export const dynamic = "force-dynamic";

/// Émargement vu par le formateur : uniquement ses propres sessions.
export default async function PageMonEmargement({ params }: { params: Promise<{ id: string }> }) {
  const utilisateur = await exigerRole("FORMATEUR");
  const { id } = await params;
  const session = await sessionPourEmargement(utilisateur, id);
  if (!session) notFound();

  return <ContenuEmargement session={session} lienRetour={`/mes-sessions/${session.id}`} />;
}
