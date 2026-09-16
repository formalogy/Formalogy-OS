import Link from "next/link";
import { notFound } from "next/navigation";

import { EditeurModele } from "@/app/(app)/parametres/modeles-emails/[id]/editeur";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function PageModeleEmail({ params }: { params: Promise<{ id: string }> }) {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");
  const { id } = await params;

  const modele = await prisma.emailTemplate.findUnique({ where: { id } });
  if (!modele) notFound();

  // Peu de règles : on filtre en mémoire plutôt que de chercher dans le JSON
  // stocké, dont le format exact dépend de la base.
  const automatisations = (await prisma.automation.findMany({ select: { nom: true, actif: true, actions: true } })).filter(
    (a) => Array.isArray(a.actions) && a.actions.some((action) => (action as { modele?: string })?.modele === modele.code),
  );

  return (
    <>
      <header className="mb-6">
        <Link href="/parametres/modeles-emails" className="text-[12.5px] font-semibold text-accent-fort hover:underline">
          ← Modèles d&apos;emails
        </Link>
        <h1 className="mt-2 text-[22px] font-extrabold tracking-tight">{modele.nom}</h1>
        <p className="mt-1 text-[12.5px] text-texte-doux">
          <span className="font-mono text-texte-tenu">{modele.code}</span>
          {modele.description ? ` · ${modele.description}` : ""}
        </p>
      </header>

      {automatisations.length > 0 && (
        <p className="mb-4 text-[12.5px] text-texte-doux">
          Utilisé par :{" "}
          {automatisations.map((a) => `${a.nom}${a.actif ? "" : " (désactivée)"}`).join(", ")}.
        </p>
      )}

      <EditeurModele
        lectureSeule={utilisateur.role !== "ADMIN"}
        initial={{
          id: modele.id,
          nom: modele.nom,
          description: modele.description ?? "",
          sujet: modele.sujet,
          corps: modele.corps,
          actif: modele.actif,
        }}
      />
    </>
  );
}
