import Link from "next/link";

import { calculerBpf, type LigneBpf } from "@/lib/bpf";
import { formaterMontant } from "@/lib/factures";
import { exigerRole } from "@/lib/session";
import { anneesDisponibles } from "@/lib/statistiques";

export const dynamic = "force-dynamic";

const nombre = (n: number | undefined) => (n ?? 0).toLocaleString("fr-FR", { maximumFractionDigits: 1 });

function Tableau({ lignes, colonnes, total }: { lignes: LigneBpf[]; colonnes: ("montant" | "nombre" | "heures")[]; total?: Partial<Record<"montant" | "nombre" | "heures", number>> }) {
  const titre = { montant: "Montant HT", nombre: "Stagiaires", heures: "Heures" };
  return (
    <table className="w-full text-[12.5px]">
      <thead>
        <tr className="border-b border-bordure text-left text-[11px] uppercase tracking-wider text-texte-tenu">
          <th className="py-1.5 pr-2 font-semibold">Ligne</th>
          {colonnes.map((c) => (
            <th key={c} className="py-1.5 pl-2 text-right font-semibold">{titre[c]}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {lignes.map((l, i) => {
          const vide = colonnes.every((c) => !l[c]);
          return (
            <tr key={`${l.code}-${i}`} className={`border-b border-bordure-douce align-top ${vide ? "text-texte-tenu" : ""}`}>
              <td className="py-1.5 pr-2">
                {l.code && <span className="mr-1.5 font-mono text-[11.5px] text-texte-tenu">{l.code}.</span>}
                {l.libelle}
                {l.note && <span className="block text-[11px] text-alerte">{l.note}</span>}
              </td>
              {colonnes.map((c) => (
                <td key={c} className="py-1.5 pl-2 text-right tabular-nums">{c === "montant" ? formaterMontant(l[c] ?? 0) : nombre(l[c])}</td>
              ))}
            </tr>
          );
        })}
        {total && (
          <tr className="font-bold">
            <td className="py-1.5 pr-2">Total</td>
            {colonnes.map((c) => (
              <td key={c} className="py-1.5 pl-2 text-right tabular-nums">{c === "montant" ? formaterMontant(total[c] ?? 0) : nombre(total[c])}</td>
            ))}
          </tr>
        )}
      </tbody>
    </table>
  );
}

function Cadre({ titre, children, aide }: { titre: string; children: React.ReactNode; aide?: string }) {
  return (
    <section className="rounded-xl border border-bordure bg-surface p-5 shadow-sm">
      <h2 className="text-[14.5px] font-bold">{titre}</h2>
      {aide && <p className="mb-3 mt-0.5 text-[12px] text-texte-tenu">{aide}</p>}
      <div className={aide ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

/// Bilan pédagogique et financier (Cerfa 10443), à reporter sur
/// « Mon activité formation » avant le 31 mai pour l'exercice précédent.
export default async function PageBpf({ searchParams }: { searchParams: Promise<{ annee?: string }> }) {
  await exigerRole("ADMIN", "GESTIONNAIRE");
  const annees = await anneesDisponibles();
  const demandee = Number((await searchParams).annee);
  // Par défaut l'exercice précédent : c'est celui qu'on déclare.
  const annee = annees.includes(demandee) ? demandee : (annees.find((a) => a === new Date().getFullYear() - 1) ?? annees[0]);
  const b = await calculerBpf(annee);
  const o = b.organisme;

  return (
    <>
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight">Bilan pédagogique et financier {annee}</h1>
          <p className="mt-1 max-w-2xl text-[12.8px] text-texte-doux">
            Calculé à partir des factures, inscriptions et formateurs de l&apos;application. À reporter sur
            « Mon activité formation » avant le 31 mai {annee + 1}. Relisez-le : certains cadres sont à compléter vous-même.
          </p>
        </div>
        <nav className="flex flex-wrap gap-1.5">
          {annees.map((a) => (
            <Link
              key={a}
              href={`/bpf?annee=${a}`}
              className={`rounded-full px-3 py-1 text-[12.5px] font-semibold ${a === annee ? "bg-accent text-white" : "border border-bordure bg-surface"}`}
            >
              {a}
            </Link>
          ))}
        </nav>
      </header>

      {b.alertes.length > 0 && (
        <div className="mb-4 max-w-4xl rounded-lg bg-alerte/12 px-4 py-2.5 text-[12.5px] text-alerte">
          {b.alertes.map((a) => (
            <p key={a}>{a}</p>
          ))}
        </div>
      )}

      <div className="grid max-w-5xl gap-4 lg:grid-cols-2">
        <Cadre titre="A. Identification de l'organisme">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[12.5px]">
            <dt className="text-texte-tenu">Raison sociale</dt><dd>{o.raisonSociale}</dd>
            <dt className="text-texte-tenu">N° de déclaration</dt><dd>{o.numeroDeclaration ?? "à compléter (Paramètres → Organisme)"}</dd>
            <dt className="text-texte-tenu">SIRET</dt><dd>{o.siret ?? "à compléter"}</dd>
            <dt className="text-texte-tenu">Adresse</dt><dd>{[o.adresse, o.codePostal, o.ville].filter(Boolean).join(" ") || "à compléter"}</dd>
            <dt className="text-texte-tenu">Exercice</dt><dd>du 01/01/{annee} au 31/12/{annee}</dd>
          </dl>
        </Cadre>

        <Cadre titre="E. Personnes dispensant des heures de formation" aide="Formateurs des sessions terminées dans l'exercice ; heures = durée des formations animées.">
          <Tableau
            colonnes={["nombre", "heures"]}
            lignes={[
              { code: "", libelle: "Personnes de votre organisme (formateurs salariés)", ...b.formateurs.internes },
              { code: "", libelle: "Personnes extérieures (indépendants, sous-traitants)", ...b.formateurs.externes },
            ]}
          />
          <p className="mt-2 text-[11px] text-texte-tenu">Colonne « Formateurs » : le nombre de personnes, pas de stagiaires.</p>
        </Cadre>

        <div className="lg:col-span-2">
          <Cadre titre="C. Bilan financier — origine des produits (HT)" aide="Factures émises dans l'exercice (numéro Henrri), classées selon le payeur.">
            <Tableau colonnes={["montant"]} lignes={b.produits} total={{ montant: b.totalProduits }} />
          </Cadre>
        </div>

        <Cadre titre="F-1. Type de stagiaires" aide="Stagiaires dont la formation s'est terminée dans l'exercice ; heures = durée moins les absences signalées (en ligne : durée complète).">
          <Tableau colonnes={["nombre", "heures"]} lignes={b.stagiaires} total={b.totalStagiaires} />
        </Cadre>

        <Cadre titre="F-3. Objectif général des prestations" aide="D'après le champ « Certification » de chaque formation (RNCP, RS / TOSA…).">
          <Tableau colonnes={["nombre", "heures"]} lignes={b.objectifs} total={b.totalStagiaires} />
        </Cadre>

        <Cadre titre="F-4. Spécialités de formation (5 principales)" aide="Par catégorie de formation : indiquez le code NSF de chacune sur le formulaire.">
          {b.specialites.length ? <Tableau colonnes={["nombre", "heures"]} lignes={b.specialites} /> : <p className="text-[12.5px] text-texte-tenu">Aucun stagiaire sur l&apos;exercice.</p>}
        </Cadre>

        <Cadre titre="À compléter vous-même">
          <ul className="list-disc space-y-1 pl-5 text-[12.5px] text-texte-doux">
            <li><strong>B.</strong> Caractéristiques de l&apos;organisme (forme juridique…).</li>
            <li><strong>D.</strong> Charges de l&apos;exercice (total, salaires des formateurs, achats de prestations) : depuis votre comptabilité.</li>
            <li><strong>C-10 et F-2.</strong> Sous-traitance avec d&apos;autres organismes de formation, s&apos;il y en a.</li>
            <li><strong>G.</strong> Stagiaires confiés par un autre organisme.</li>
            <li>Formations suivies <strong>avant</strong> l&apos;usage de Formalogy OS (par exemple dans Qualiobee) : à ajouter.</li>
          </ul>
        </Cadre>
      </div>
    </>
  );
}
