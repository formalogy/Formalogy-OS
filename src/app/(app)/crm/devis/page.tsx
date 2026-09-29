import type { StatutDevis } from "@prisma/client";
import Link from "next/link";

import { classerDevis } from "@/app/(app)/crm/devis/actions";
import { BoutonActualiser } from "@/app/(app)/crm/devis/actualiser";
import { lireRegle } from "@/lib/automatisations/moteur";
import { LIBELLE_STATUT_DEVIS, TON_STATUT_DEVIS } from "@/lib/devis";
import { formaterMontant } from "@/lib/factures";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";
import { ajouterJours, aujourdhuiUTC } from "@/lib/sessions-libelles";

export const dynamic = "force-dynamic";

const jour = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
const jourParis = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" });
const STATUTS: StatutDevis[] = ["EN_ATTENTE", "ACCEPTE", "REFUSE", "SANS_SUITE"];

function Compteur({ libelle, valeur, precision, ton = "" }: { libelle: string; valeur: string | number; precision?: string; ton?: string }) {
  return (
    <div className="rounded-xl border border-bordure bg-surface p-4 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-texte-tenu">{libelle}</div>
      <div className={`mt-2 font-mono text-2xl font-semibold tabular-nums ${ton}`}>{valeur}</div>
      {precision && <div className="mt-1 text-[11.5px] text-texte-tenu">{precision}</div>}
    </div>
  );
}

/// Devis établis dans Henrri (A-15) : comptés, rapprochés du CRM et relancés
/// automatiquement tant qu'ils restent sans réponse.
export default async function PageDevis({ searchParams }: { searchParams: Promise<{ statut?: string }> }) {
  await exigerRole("ADMIN", "GESTIONNAIRE");
  const { statut: filtre } = await searchParams;
  const statut = STATUTS.includes(filtre as StatutDevis) ? (filtre as StatutDevis) : undefined;
  const aujourdhui = aujourdhuiUTC();
  const debutAnnee = new Date(Date.UTC(aujourdhui.getUTCFullYear(), 0, 1));

  const [devis, annee, automation] = await Promise.all([
    prisma.devis.findMany({
      where: statut ? { statut } : {},
      orderBy: { date: "desc" },
      take: 300,
      include: {
        learner: { select: { id: true, prenom: true, nom: true } },
        company: { select: { id: true, raisonSociale: true } },
        prospect: { select: { id: true, prenom: true, nom: true } },
      },
    }),
    prisma.devis.groupBy({ by: ["statut"], where: { date: { gte: debutAnnee } }, _count: true, _sum: { montantHT: true } }),
    prisma.automation.findFirst({ where: { declencheur: "DEVIS_EN_ATTENTE" } }),
  ]);

  const parStatut = Object.fromEntries(annee.map((g) => [g.statut, { nombre: g._count, montant: Number(g._sum.montantHT ?? 0) }]));
  const compte = (s: StatutDevis) => parStatut[s]?.nombre ?? 0;
  const clos = compte("ACCEPTE") + compte("REFUSE") + compte("SANS_SUITE");
  const taux = clos === 0 ? null : Math.round((compte("ACCEPTE") / clos) * 100);
  const regle = automation ? lireRegle(automation).parametres : null;
  const delai = regle?.jours ?? 15;
  const maximum = regle?.relances ?? 3;
  const relancesActives = Boolean(automation?.actif);

  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/crm" className="text-[12.5px] font-semibold text-accent-fort hover:underline">
            ← CRM
          </Link>
          <h1 className="mt-2 text-[22px] font-extrabold tracking-tight">Devis</h1>
          <p className="mt-1 max-w-2xl text-[12.8px] text-texte-doux">
            Les devis faits dans Henrri, repris ici chaque jour.{" "}
            {relancesActives
              ? `Sans réponse, le client est relancé tous les ${delai} jours, ${maximum} fois au plus ; ensuite, le devis passe « sans suite ».`
              : "Les relances automatiques sont désactivées (Paramètres → Automatisations)."}{" "}
            Un devis est accepté seul quand le client le valide en ligne dans Henrri ou quand il est inscrit à une session.
          </p>
        </div>
        <BoutonActualiser />
      </header>

      <section className="mb-4 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <Compteur libelle="En attente" valeur={compte("EN_ATTENTE")} precision={`${formaterMontant(parStatut.EN_ATTENTE?.montant ?? 0)} HT`} />
        <Compteur libelle="Acceptés" valeur={compte("ACCEPTE")} precision={`${formaterMontant(parStatut.ACCEPTE?.montant ?? 0)} HT`} ton="text-succes" />
        <Compteur libelle="Sans suite ou refusés" valeur={compte("SANS_SUITE") + compte("REFUSE")} />
        <Compteur libelle="Taux de transformation" valeur={taux === null ? "—" : `${taux} %`} precision="acceptés parmi les devis tranchés" />
      </section>
      <p className="-mt-2 mb-4 text-[11.5px] text-texte-tenu">Compteurs : devis datés de {aujourdhui.getUTCFullYear()}.</p>

      <nav className="mb-3 flex flex-wrap gap-1.5 text-[12.5px]">
        {[undefined, ...STATUTS].map((s) => (
          <Link
            key={s ?? "tous"}
            href={s ? `/crm/devis?statut=${s}` : "/crm/devis"}
            className={`rounded-full px-3 py-1 font-semibold ${statut === s ? "bg-accent text-white" : "border border-bordure bg-surface text-texte-doux hover:bg-surface-creuse"}`}
          >
            {s ? LIBELLE_STATUT_DEVIS[s] : "Tous"}
          </Link>
        ))}
      </nav>

      <section className="overflow-hidden rounded-xl border border-bordure bg-surface shadow-sm">
        {devis.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-texte-doux">
            {statut ? "Aucun devis dans cette catégorie." : "Aucun devis repris de Henrri pour le moment."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12.8px]">
              <thead>
                <tr className="bg-surface-creuse text-left text-[10.8px] uppercase tracking-wider text-texte-tenu">
                  <th className="px-4 py-2.5 font-semibold">Devis</th>
                  <th className="px-4 py-2.5 font-semibold">Client</th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-right font-semibold">Montant HT</th>
                  <th className="px-4 py-2.5 font-semibold">Suivi</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Statut</th>
                </tr>
              </thead>
              <tbody>
                {devis.map((d) => {
                  const fiche = d.learner
                    ? { href: `/apprenants/${d.learner.id}`, libelle: `Apprenant : ${d.learner.prenom} ${d.learner.nom}` }
                    : d.prospect
                      ? { href: `/crm`, libelle: `Prospect : ${d.prospect.prenom} ${d.prospect.nom}` }
                      : d.company
                        ? { href: `/entreprises/${d.company.id}`, libelle: `Entreprise : ${d.company.raisonSociale}` }
                        : null;
                  const depuis = d.derniereRelanceAt ? new Date(`${jourParis.format(d.derniereRelanceAt)}T00:00:00.000Z`) : d.date;
                  const prochaine = ajouterJours(depuis, delai);
                  const suivi =
                    d.statut !== "EN_ATTENTE"
                      ? d.motifStatut
                      : !relancesActives
                        ? `${d.relances} relance${d.relances > 1 ? "s" : ""}`
                        : d.relances >= maximum
                          ? `${d.relances} / ${maximum} relances · sans suite le ${jour.format(prochaine < aujourdhui ? aujourdhui : prochaine)}`
                          : `${d.relances} / ${maximum} relance${d.relances > 1 ? "s" : ""} · prochaine le ${jour.format(prochaine < aujourdhui ? aujourdhui : prochaine)}`;
                  return (
                    <tr key={d.id} className="border-t border-bordure-douce align-top hover:bg-surface-creuse">
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <div className="font-semibold">n° {d.numero}</div>
                        <div className="text-[11.5px] text-texte-tenu">du {jour.format(d.date)}</div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="font-semibold">{d.clientNom}</div>
                        <div className="text-[11.5px] text-texte-tenu">
                          {fiche ? (
                            <Link href={fiche.href} className="hover:text-accent-fort">
                              {fiche.libelle}
                            </Link>
                          ) : (
                            "Aucune fiche du CRM rapprochée"
                          )}
                          {d.objet && <span> · {d.objet}</span>}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right font-mono tabular-nums">{formaterMontant(d.montantHT)}</td>
                      <td className="px-4 py-2.5 text-[12px] text-texte-doux">{suivi ?? "—"}</td>
                      <td className="px-4 py-2.5">
                        <form action={classerDevis} className="flex items-center gap-1.5">
                          <input type="hidden" name="id" value={d.id} />
                          <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${TON_STATUT_DEVIS[d.statut]}`}>
                            {LIBELLE_STATUT_DEVIS[d.statut]}
                          </span>
                          <select name="statut" defaultValue="" aria-label={`Classer le devis ${d.numero}`} className="rounded-md border border-bordure bg-surface px-1.5 py-1 text-[12px]">
                            <option value="" disabled>
                              Classer…
                            </option>
                            {STATUTS.filter((s) => s !== d.statut).map((s) => (
                              <option key={s} value={s}>
                                {s === "EN_ATTENTE" ? "Rouvrir" : LIBELLE_STATUT_DEVIS[s]}
                              </option>
                            ))}
                          </select>
                          <button type="submit" className="rounded-md border border-bordure px-2 py-1 text-[12px] font-semibold text-accent-fort hover:bg-surface-creuse">
                            OK
                          </button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
