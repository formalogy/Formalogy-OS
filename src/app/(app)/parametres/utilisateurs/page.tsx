import { FormulaireUtilisateur } from "@/app/(app)/parametres/utilisateurs/formulaire";
import { LigneUtilisateur } from "@/app/(app)/parametres/utilisateurs/ligne";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";

export const dynamic = "force-dynamic";

/// Comptes internes (administrateurs, gestionnaires). Les formateurs ont
/// leur propre gestion d'accès, depuis leur fiche (menu Formateurs).
export default async function PageUtilisateurs() {
  const utilisateur = await exigerRole("ADMIN");

  const comptes = await prisma.user.findMany({
    where: { role: { in: ["ADMIN", "GESTIONNAIRE"] }, deletedAt: null },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: { id: true, name: true, email: true, role: true, isActive: true, lastLoginAt: true },
  });

  return (
    <>
      <header className="mb-6">
        <h1 className="text-[22px] font-extrabold tracking-tight">Utilisateurs</h1>
        <p className="mt-1 max-w-2xl text-[12.8px] text-texte-doux">
          Comptes de l&apos;équipe interne. Les formateurs ont leur propre accès, ouvert depuis leur fiche
          (menu « Formateurs »).
        </p>
      </header>

      <div className="mb-4">
        <FormulaireUtilisateur />
      </div>

      <section className="rounded-xl border border-bordure bg-surface p-1 shadow-sm">
        <ul>
          {comptes.map((c) => (
            <LigneUtilisateur
              key={c.id}
              id={c.id}
              nom={c.name}
              email={c.email}
              role={c.role as "ADMIN" | "GESTIONNAIRE"}
              actif={c.isActive}
              dernierConnexionAt={c.lastLoginAt}
              estMoi={c.id === utilisateur.id}
            />
          ))}
        </ul>
      </section>
    </>
  );
}
