import Link from "next/link";

import { Indicateur } from "@/app/(app)/qualiopi/indicateur";
import { lireOrganisme } from "@/lib/organisme";
import { prisma } from "@/lib/prisma";
import { avancement, CRITERES, LIBELLE_STATUT_ACTION, VERSION_REFERENTIEL } from "@/lib/qualiopi";
import { exigerRole } from "@/lib/session";

export const dynamic = "force-dynamic";

const jour = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Paris" });

export default async function PageQualiopi() {
  await exigerRole("ADMIN", "GESTIONNAIRE");

  const [indicateurs, organisme, actionsOuvertes] = await Promise.all([
    prisma.indicateurQualiopi.findMany({
      orderBy: { numero: "asc" },
      include: {
        updatedBy: { select: { name: true } },
        preuves: {
          where: { deletedAt: null },
          orderBy: { updatedAt: "desc" },
          select: { id: true, nom: true, type: { select: { nom: true } } },
        },
        actions: { where: { statut: { not: "FAITE" } }, select: { id: true, titre: true, statut: true } },
      },
    }),
    lireOrganisme(),
    prisma.actionQualite.count({ where: { statut: { not: "FAITE" } } }),
  ]);

  const global = avancement(indicateurs);

  return (
    <>
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight">Qualiopi</h1>
          <p className="mt-1 text-[12.8px] text-texte-doux">
            Référentiel national qualité {VERSION_REFERENTIEL.nom} ({VERSION_REFERENTIEL.texte}), applicable aux{" "}
            {VERSION_REFERENTIEL.applicableAux}. 33 indicateurs, dont ceux qui ne concernent pas votre activité.
          </p>
        </div>
        <Link href="/qualiopi/actions" className="rounded-lg border border-bordure bg-surface px-4 py-2 text-[13px] font-semibold">
          Plan d&apos;actions{actionsOuvertes > 0 ? ` (${actionsOuvertes})` : ""}
        </Link>
      </header>

      <section className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-bordure bg-surface p-4 shadow-sm sm:col-span-2">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-texte-tenu">Préparation à l&apos;audit</span>
            <span className="font-mono text-[13px] font-semibold tabular-nums">
              {global.conformes} / {global.applicables} indicateurs
            </span>
          </div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-surface-creuse">
            <div className="h-full rounded-full bg-succes transition-all" style={{ width: `${global.pourcentage}%` }} />
          </div>
          <p className="mt-2 text-[12px] text-texte-tenu">
            Cocher un indicateur signifie : les preuves sont réunies et à jour. C&apos;est votre suivi interne, il ne remplace pas l&apos;avis de l&apos;auditeur.
          </p>
        </div>
        <div className="rounded-xl border border-bordure bg-surface p-4 text-[12.5px] shadow-sm">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-texte-tenu">Certification</span>
          <dl className="mt-2 flex flex-col gap-1">
            <div className="flex justify-between gap-2">
              <dt className="text-texte-tenu">Certificateur</dt>
              <dd className="text-right font-semibold">{organisme.qualiopiCertificateur ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-texte-tenu">Valide jusqu&apos;au</dt>
              <dd className="text-right font-semibold">{organisme.qualiopiExpireAt ? jour.format(organisme.qualiopiExpireAt) : "—"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-texte-tenu">Prochain audit</dt>
              <dd className="text-right font-semibold">{organisme.qualiopiProchainAuditAt ? jour.format(organisme.qualiopiProchainAuditAt) : "—"}</dd>
            </div>
          </dl>
          <Link href="/parametres/organisme" className="mt-2 inline-block text-[12px] font-semibold text-accent-fort hover:underline">
            Modifier
          </Link>
        </div>
      </section>

      <div className="flex flex-col gap-4">
        {CRITERES.map((critere) => {
          const duCritere = indicateurs.filter((i) => i.critere === critere.numero);
          const a = avancement(duCritere);
          return (
            <section key={critere.numero} className="overflow-hidden rounded-xl border border-bordure bg-surface shadow-sm">
              <div className="border-b border-bordure-douce px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-[14.5px] font-bold">
                    Critère {critere.numero} — {critere.court}
                  </h2>
                  <span className={`font-mono text-[12px] tabular-nums ${a.applicables > 0 && a.conformes === a.applicables ? "font-semibold text-succes" : "text-texte-tenu"}`}>
                    {a.conformes} / {a.applicables}
                  </span>
                </div>
                <p className="mt-0.5 text-[12px] text-texte-doux">{critere.intitule}</p>
              </div>
              <div>
                {duCritere.map((i) => (
                  <Indicateur
                    key={i.numero}
                    numero={i.numero}
                    intitule={i.intitule}
                    specifique={i.specifique}
                    applicable={i.applicable}
                    conforme={i.statut === "CONFORME"}
                    notes={i.notes}
                    preuves={i.preuves.map((d) => ({ id: d.id, nom: d.nom, typeNom: d.type?.nom ?? null }))}
                    actions={i.actions.map((x) => ({ id: x.id, titre: x.titre, statut: LIBELLE_STATUT_ACTION[x.statut] }))}
                    majPar={i.updatedBy?.name ?? null}
                    majLe={jour.format(i.updatedAt)}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
