import Link from "next/link";

import { henrriConfigure } from "@/lib/henrri/client";
import { envoiReelActif } from "@/lib/emails/envoi";
import { exigerRole } from "@/lib/session";
import { boiteConfiguree } from "@/lib/signatures/boite-mail";
import { stockageConfigure } from "@/lib/stockage";

export const dynamic = "force-dynamic";

type Ligne = { nom: string; description: string; ok: boolean; detail: string; lien?: { href: string; libelle: string } };

/// Photographie de ce qui est branché ou non, à partir du fichier .env.
/// Aucune clé ne se modifie ici : les secrets restent côté serveur, jamais
/// dans un formulaire web ni en base (voir CLAUDE.md, section Sécurité).
export default async function PageIntegrations() {
  await exigerRole("ADMIN");

  const gmailConfigure = Boolean(process.env.GMAIL_ADRESSE && process.env.GMAIL_MOT_DE_PASSE_APPLI);
  const reveilConfigure = Boolean(process.env.CRON_SECRET);

  const lignes: Ligne[] = [
    {
      nom: "Emails (Gmail)",
      description: "Convocations, rappels, questionnaires de satisfaction.",
      ok: envoiReelActif(),
      detail: !gmailConfigure
        ? "Adresse Gmail dédiée non configurée : les emails sont simulés, jamais envoyés."
        : process.env.EMAILS_ENVOI_REEL !== "true"
          ? "Adresse configurée, mais l'envoi réel est encore coupé (EMAILS_ENVOI_REEL). Les emails restent simulés."
          : `Envoi réel actif, depuis ${process.env.GMAIL_ADRESSE}.`,
    },
    {
      nom: "Stockage des documents (Supabase)",
      description: "Tous les fichiers déposés dans l'application : contrats, programmes, factures, preuves…",
      ok: stockageConfigure(),
      detail: stockageConfigure() ? "Connecté." : "Non configuré : aucun document ne peut être déposé.",
    },
    {
      nom: "Signature électronique (BoldSign)",
      description: "L'envoi se fait depuis le site BoldSign ; aucune clé n'est nécessaire ici.",
      ok: true,
      detail: "Rien à configurer côté Formalogy OS. Le retour des documents signés dépend de la boîte email ci-dessous.",
      lien: { href: "/signatures", libelle: "Voir les signatures" },
    },
    {
      nom: "Boîte email dédiée (relève des documents signés)",
      description: "Récupère automatiquement les documents signés (BoldSign) envoyés à cette adresse.",
      ok: boiteConfiguree(),
      detail: boiteConfiguree()
        ? `Connectée (${process.env.GMAIL_ADRESSE}).`
        : "Non configurée : les documents signés se déposent à la main.",
      lien: { href: "/signatures", libelle: "Voir les signatures" },
    },
    {
      nom: "Facturation (Henrri)",
      description: "Numérotation officielle des factures ; génération automatique en fin de session.",
      ok: henrriConfigure(),
      detail: henrriConfigure()
        ? "Connectée. Vérifiez que l'automatisation « Facturation automatique » est activée si vous voulez qu'elle s'exécute."
        : "Non configurée : les numéros et PDF de facture se saisissent à la main.",
      lien: { href: "/factures", libelle: "Voir les factures" },
    },
    {
      nom: "Réveil quotidien (automatisations planifiées)",
      description: "Rappels avant session, relances de dossiers de financement, relève de la boîte email.",
      ok: reveilConfigure,
      detail: reveilConfigure
        ? "Secret défini. Le planificateur externe qui l'appelle chaque jour reste à mettre en place à la mise en ligne."
        : "Aucun secret défini (CRON_SECRET) : le réveil quotidien refusera toute requête.",
      lien: { href: "/parametres/automatisations", libelle: "Voir les automatisations" },
    },
  ];

  return (
    <>
      <header className="mb-6">
        <h1 className="text-[22px] font-extrabold tracking-tight">Intégrations</h1>
        <p className="mt-1 max-w-2xl text-[12.8px] text-texte-doux">
          État des services externes connectés à Formalogy OS. Les clés et mots de passe se règlent dans le
          fichier de configuration du serveur, jamais depuis cette page ni depuis un formulaire web.
        </p>
      </header>

      <section className="overflow-hidden rounded-xl border border-bordure bg-surface shadow-sm">
        <ul>
          {lignes.map((l) => (
            <li key={l.nom} className="flex flex-wrap items-start justify-between gap-3 border-t border-bordure-douce px-4 py-3.5 first:border-t-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={`size-2 shrink-0 rounded-full ${l.ok ? "bg-succes" : "bg-alerte"}`}
                  />
                  <span className="font-semibold">{l.nom}</span>
                </div>
                <p className="mt-0.5 text-[12px] text-texte-tenu">{l.description}</p>
                <p className="mt-1 text-[12.5px] text-texte-doux">{l.detail}</p>
              </div>
              {l.lien && (
                <Link href={l.lien.href} className="shrink-0 text-[12.5px] font-semibold text-accent-fort hover:underline">
                  {l.lien.libelle}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
