import Link from "next/link";

import { exigerRole } from "@/lib/session";

export const dynamic = "force-dynamic";

/// Formalogy OS n'expose aucune API destinée à des tiers : c'est un outil
/// interne (voir CLAUDE.md, « Nature du produit »). Cette page documente le
/// seul point d'entrée technique existant, à l'usage de qui configurera le
/// planificateur externe à la mise en ligne (Phase 18).
export default async function PageApi() {
  await exigerRole("ADMIN");
  const configure = Boolean(process.env.CRON_SECRET);

  return (
    <>
      <header className="mb-6">
        <h1 className="text-[22px] font-extrabold tracking-tight">API</h1>
        <p className="mt-1 max-w-2xl text-[12.8px] text-texte-doux">
          Formalogy OS n&apos;a pas vocation à être utilisé par des outils extérieurs : c&apos;est un
          logiciel interne, pas un service auquel d&apos;autres applications se connectent. Le seul point
          d&apos;entrée technique existant est le réveil quotidien des automatisations.
        </p>
      </header>

      <section className="max-w-2xl rounded-xl border border-bordure bg-surface p-5 shadow-sm">
        <h2 className="text-[15px] font-bold">Réveil des automatisations planifiées</h2>
        <p className="mt-1 text-[12.5px] text-texte-doux">
          Envoie les rappels avant session, relance les dossiers de financement en attente, et relève la
          boîte email pour les documents signés. Prévu pour être appelé une fois par jour (ou plus souvent
          pour la relève des signatures) par un planificateur externe, à mettre en place à la mise en ligne.
        </p>
        <dl className="mt-4 flex flex-col gap-2 text-[12.8px]">
          <div>
            <dt className="font-semibold text-texte-tenu">Adresse</dt>
            <dd className="mt-0.5 font-mono">POST /api/automatisations/executer</dd>
          </div>
          <div>
            <dt className="font-semibold text-texte-tenu">Authentification</dt>
            <dd className="mt-0.5 font-mono">Authorization: Bearer &lt;CRON_SECRET&gt;</dd>
          </div>
          <div>
            <dt className="font-semibold text-texte-tenu">Secret</dt>
            <dd className="mt-0.5">
              <span className={`inline-flex items-center gap-1.5 font-semibold ${configure ? "text-succes" : "text-alerte"}`}>
                <span aria-hidden="true" className={`size-2 rounded-full ${configure ? "bg-succes" : "bg-alerte"}`} />
                {configure ? "Défini" : "Non défini"}
              </span>
              <span className="ml-1 text-texte-tenu">— valeur dans le fichier de configuration du serveur, jamais affichée ici.</span>
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-[12px] text-texte-tenu">
          Pour un essai immédiat sans planificateur externe, un bouton{" "}
          <Link href="/parametres/automatisations" className="font-semibold text-accent-fort hover:underline">
            « Exécuter les automatisations planifiées »
          </Link>{" "}
          fait la même chose depuis l&apos;application.
        </p>
      </section>
    </>
  );
}
