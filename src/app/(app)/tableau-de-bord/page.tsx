import { prisma } from "@/lib/prisma";
import { exigerUtilisateur } from "@/lib/session";

export const dynamic = "force-dynamic";

const dateLongue = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const heureCourte = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/// Indicateur dont la source de données n'existe pas encore.
/// On affiche la structure cible sans jamais inventer de chiffre.
function IndicateurAVenir({ libelle, phase }: { libelle: string; phase: number }) {
  return (
    <div className="rounded-xl border border-dashed border-bordure bg-surface/50 p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-texte-tenu">
        {libelle}
      </div>
      <div className="mt-2 font-mono text-2xl text-texte-tenu">—</div>
      <div className="mt-2.5 border-t border-bordure-douce pt-2.5 text-[11.5px] text-texte-tenu">
        Disponible en Phase {phase}
      </div>
    </div>
  );
}

function Indicateur({
  libelle,
  valeur,
  precision,
}: {
  libelle: string;
  valeur: string | number;
  precision: string;
}) {
  return (
    <div className="rounded-xl border border-bordure bg-surface p-4 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-texte-tenu">
        {libelle}
      </div>
      <div className="mt-2 font-mono text-2xl font-semibold tabular-nums">{valeur}</div>
      <div className="mt-2.5 border-t border-bordure-douce pt-2.5 text-[11.5px] text-texte-doux">
        {precision}
      </div>
    </div>
  );
}

export default async function PageTableauDeBord() {
  const utilisateur = await exigerUtilisateur();

  const [nombreComptes, nombreApprenants, nombreEntreprises, nombreFormations, activites] =
    await Promise.all([
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.learner.count({
        where: { deletedAt: null, statut: { in: ["INSCRIT", "EN_FORMATION"] } },
      }),
      prisma.company.count({ where: { deletedAt: null } }),
      prisma.formation.count({ where: { deletedAt: null, statut: "ACTIVE" } }),
      prisma.activity.findMany({
        orderBy: { createdAt: "desc" },
        take: 8,
        include: { user: { select: { name: true } } },
      }),
    ]);

  return (
    <>
      <header className="mb-6">
        <h1 className="text-[22px] font-extrabold tracking-tight">Tableau de bord</h1>
        <p className="mt-1 text-[12.8px] text-texte-doux">
          Bonjour {utilisateur.name.split(" ")[0]} — nous sommes le{" "}
          {dateLongue.format(new Date())}.
        </p>
      </header>

      <section aria-label="Indicateurs financiers" className="grid gap-3.5 sm:grid-cols-3">
        <IndicateurAVenir libelle="CA du mois" phase={13} />
        <IndicateurAVenir libelle="CA encaissé" phase={13} />
        <IndicateurAVenir libelle="Reste à encaisser" phase={13} />
      </section>

      <section
        aria-label="Indicateurs d'activité"
        className="mt-3.5 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4"
      >
        <Indicateur
          libelle="Apprenants actifs"
          valeur={nombreApprenants}
          precision="inscrits ou en formation"
        />
        <Indicateur
          libelle="Entreprises clientes"
          valeur={nombreEntreprises}
          precision={nombreEntreprises > 1 ? "fiches enregistrées" : "fiche enregistrée"}
        />
        <Indicateur
          libelle="Formations au catalogue"
          valeur={nombreFormations}
          precision={nombreFormations > 1 ? "formations actives" : "formation active"}
        />
        <Indicateur
          libelle="Comptes internes"
          valeur={nombreComptes}
          precision={nombreComptes > 1 ? "utilisateurs actifs" : "utilisateur actif"}
        />
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <section className="overflow-hidden rounded-xl border border-bordure bg-surface shadow-sm">
          <div className="flex items-center justify-between border-b border-bordure-douce px-4 py-3">
            <h2 className="text-[14.5px] font-bold">Activité récente</h2>
            <span className="rounded-full bg-surface-creuse px-2 py-0.5 font-mono text-[11px] text-texte-tenu">
              {activites.length}
            </span>
          </div>

          {activites.length === 0 ? (
            <p className="px-4 py-6 text-[13px] text-texte-doux">
              Aucune activité enregistrée pour le moment.
            </p>
          ) : (
            <ul>
              {activites.map((activite) => (
                <li
                  key={activite.id}
                  className="flex gap-3 border-t border-bordure-douce px-4 py-2.5 first:border-t-0"
                >
                  <span
                    aria-hidden="true"
                    className="mt-1.5 size-2 shrink-0 rounded-full bg-accent"
                  />
                  <div className="min-w-0">
                    <p className="text-[13px]">{activite.summary}</p>
                    <p className="mt-0.5 text-[11.5px] text-texte-tenu">
                      {heureCourte.format(activite.createdAt)}
                      {activite.user ? ` · ${activite.user.name}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="flex flex-col gap-4">
          <section className="rounded-xl border border-bordure bg-surface p-4 shadow-sm">
            <h2 className="text-[14.5px] font-bold">Documents manquants</h2>
            <p className="mt-2 text-[12.5px] text-texte-doux">
              Conventions non signées, émargements absents, attestations à générer.
            </p>
            <p className="mt-3 border-t border-bordure-douce pt-3 text-[11.5px] text-texte-tenu">
              Alimenté à partir de la Phase 8.
            </p>
          </section>

          <section className="rounded-xl border border-bordure bg-surface p-4 shadow-sm">
            <h2 className="text-[14.5px] font-bold">Tâches</h2>
            <p className="mt-2 text-[12.5px] text-texte-doux">
              Relances commerciales, dossiers à compléter, factures impayées, actions
              Qualiopi.
            </p>
            <p className="mt-3 border-t border-bordure-douce pt-3 text-[11.5px] text-texte-tenu">
              Alimenté à partir de la Phase 9.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
