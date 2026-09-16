import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";

export const dynamic = "force-dynamic";

const dateComplete = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function PageActivite() {
  // Le journal retrace toute l'activité de l'organisme : un formateur n'y a
  // pas accès. Le contrôle est fait ici, côté serveur.
  await exigerRole("ADMIN", "GESTIONNAIRE");

  const activites = await prisma.activity.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { user: { select: { name: true, email: true } } },
  });

  return (
    <>
      <header className="mb-6">
        <h1 className="text-[22px] font-extrabold tracking-tight">Activité</h1>
        <p className="mt-1 text-[12.8px] text-texte-doux">
          Journal de tout ce qui se passe dans Formalogy OS. Les lignes ne sont ni
          modifiables ni supprimables : c&apos;est la piste d&apos;audit.
        </p>
      </header>

      <section className="overflow-hidden rounded-xl border border-bordure bg-surface shadow-sm">
        {activites.length === 0 ? (
          <p className="px-4 py-6 text-[13px] text-texte-doux">
            Aucune activité enregistrée pour le moment.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12.8px]">
              <thead>
                <tr className="bg-surface-creuse text-left text-[10.8px] uppercase tracking-wider text-texte-tenu">
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Date</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Auteur</th>
                  <th className="px-4 py-2.5 font-semibold">Action</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Code</th>
                </tr>
              </thead>
              <tbody>
                {activites.map((activite) => (
                  <tr key={activite.id} className="border-t border-bordure-douce">
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono tabular-nums text-texte-doux">
                      {dateComplete.format(activite.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5">
                      {activite.user?.name ?? "—"}
                    </td>
                    <td className="px-4 py-2.5">{activite.summary}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[11.5px] text-texte-tenu">
                      {activite.action}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
