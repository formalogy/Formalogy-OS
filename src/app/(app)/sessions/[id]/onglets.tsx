import { IconAlertCircle, IconChevronDown, IconCircleCheck, IconChevronRight } from "@tabler/icons-react";
import Link from "next/link";

import { texteFormationVersHtml } from "@/lib/formations-texte";

/// Éléments de la fiche session en onglets (client, 05/10/2026, d'après
/// Qualiobee) : navigation, actions à traiter, blocs repliables.

export const ONGLETS = [
  { cle: "actions", libelle: "Actions à traiter" },
  { cle: "informations", libelle: "Informations" },
  { cle: "participants", libelle: "Participants" },
  { cle: "formateurs", libelle: "Formateurs" },
  { cle: "documents", libelle: "Documents" },
  { cle: "questionnaires", libelle: "Questionnaires" },
  { cle: "deroulement", libelle: "Déroulement" },
  { cle: "parametres", libelle: "Paramètres" },
] as const;
export type CleOnglet = (typeof ONGLETS)[number]["cle"];

export function NavOnglets({ sessionId, actif, aTraiter }: { sessionId: string; actif: CleOnglet; aTraiter: number }) {
  return (
    <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-bordure" aria-label="Onglets de la session">
      {ONGLETS.map((o) => (
        <Link
          key={o.cle}
          href={`/sessions/${sessionId}?onglet=${o.cle}`}
          aria-current={o.cle === actif ? "page" : undefined}
          className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-[13px] font-semibold ${
            o.cle === actif ? "border-texte text-texte" : "border-transparent text-texte-doux hover:text-texte"
          }`}
        >
          {o.libelle}
          {o.cle === "actions" && aTraiter > 0 && (
            <span className="rounded-full bg-danger px-1.5 text-[10.5px] font-bold text-white">{aTraiter}</span>
          )}
        </Link>
      ))}
    </nav>
  );
}

export type Action = { libelle: string; fait: boolean; lien?: string; bouton?: string; detail?: string };

/// Liste « Actions à traiter » : ce qui manque d'abord, avec son bouton,
/// puis ce qui est prêt.
export function ListeActions({ actions }: { actions: Action[] }) {
  const aFaire = actions.filter((a) => !a.fait);
  const faites = actions.filter((a) => a.fait);
  return (
    <section className="max-w-3xl">
      <h2 className="text-[17px] font-bold">
        {aFaire.length === 0 ? "Tout est prêt" : `${aFaire.length} action${aFaire.length > 1 ? "s" : ""} en attente`}
      </h2>
      <p className="mb-4 mt-0.5 text-[12.8px] text-texte-doux">
        {aFaire.length === 0
          ? "La session peut être lancée : tout partira ensuite aux dates prévues."
          : "Quelques actions à effectuer avant de lancer votre session de formation."}
      </p>
      <ul className="flex flex-col gap-2">
        {[...aFaire, ...faites].map((a) => (
          <li key={a.libelle} className="flex items-center gap-3 rounded-xl border border-bordure bg-surface px-4 py-3 shadow-sm">
            {a.fait ? (
              <IconCircleCheck className="size-6 shrink-0 text-succes" stroke={1.8} aria-hidden="true" />
            ) : (
              <IconAlertCircle className="size-6 shrink-0 text-danger" stroke={1.8} aria-hidden="true" />
            )}
            <div className="min-w-0 flex-1">
              <div className={`text-[13.5px] font-semibold ${a.fait ? "text-texte-doux" : ""}`}>{a.libelle}</div>
              {a.detail && <div className="text-[12px] text-texte-tenu">{a.detail}</div>}
            </div>
            {a.fait ? (
              <span className="shrink-0 rounded-full border border-bordure px-2.5 py-0.5 text-[11.5px] text-texte-tenu">Terminé</span>
            ) : (
              a.lien && (
                <Link href={a.lien} className="flex shrink-0 items-center gap-1 rounded-full bg-texte px-3.5 py-1.5 text-[12.5px] font-semibold text-surface">
                  {a.bouton ?? "Ajouter"} <IconChevronRight className="size-4" aria-hidden="true" />
                </Link>
              )
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/// Bloc repliable de l'onglet Informations, avec son état à droite.
export function BlocInfo({
  titre,
  badge,
  aCompleter,
  ouvert,
  children,
}: {
  titre: string;
  badge: string;
  aCompleter?: boolean;
  ouvert?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={ouvert} className="group rounded-xl border border-bordure bg-surface shadow-sm">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4">
        <span className="flex-1 text-[14.5px] font-bold">{titre}</span>
        <span className={`rounded-full border px-2.5 py-0.5 text-[12px] ${aCompleter ? "border-danger text-danger" : "border-bordure text-texte-doux"}`}>
          {badge}
        </span>
        <IconChevronDown className="size-5 text-texte-tenu transition group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="border-t border-bordure-douce px-5 py-4 text-[13px] leading-relaxed">{children}</div>
    </details>
  );
}

/// Texte du catalogue (HTML nettoyé à l'enregistrement, ou texte brut ancien).
export function TexteCatalogue({ texte }: { texte: string | null }) {
  if (!texte?.trim()) return <p className="text-texte-tenu">Non renseigné dans le catalogue.</p>;
  return (
    <div
      className="[&_p]:my-1.5 first:[&_p]:mt-0 last:[&_p]:mb-0"
      dangerouslySetInnerHTML={{ __html: texteFormationVersHtml(texte) }}
    />
  );
}
