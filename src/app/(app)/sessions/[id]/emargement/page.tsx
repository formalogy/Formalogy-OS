import { notFound } from "next/navigation";

import { ContenuEmargement } from "@/app/(app)/_composants/contenu-emargement";
import { sessionPourEmargement } from "@/lib/emargement-acces";
import { exigerRole } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function PageEmargementSession({ params }: { params: Promise<{ id: string }> }) {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");
  const { id } = await params;
  const session = await sessionPourEmargement(utilisateur, id);
  if (!session) notFound();

  return (
    <ContenuEmargement
      session={session}
      lienRetour={`/sessions/${session.id}`}
      lienDepot={`/documents/nouveau?session=${session.id}&type=EMARGEMENT`}
    />
  );
}
