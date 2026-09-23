"use client";

import {
  IconActivity,
  IconAddressBook,
  IconBook2,
  IconBuilding,
  IconBuildingSkyscraper,
  IconCalendarEvent,
  IconCalendarWeek,
  IconCertificate,
  IconChalkboard,
  IconChartBar,
  IconChecklist,
  IconClipboardCheck,
  IconCode,
  IconCreditCard,
  IconFileInvoice,
  IconFiles,
  IconGauge,
  IconHome2,
  IconListCheck,
  IconMail,
  IconPlug,
  IconRobot,
  IconSettings,
  IconShieldLock,
  IconSignature,
  IconStar,
  IconUserCircle,
  IconUsers,
  IconWallet,
  type Icon,
} from "@tabler/icons-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import type { GroupeMenu } from "@/lib/navigation";

type Props = {
  groupes: GroupeMenu[];
  ouverte: boolean;
  onFermer: () => void;
};

/// Une icône par entrée de menu (voir la clé posée dans lib/navigation.ts).
const ICONES: Record<string, Icon> = {
  jauge: IconGauge,
  personnes: IconUsers,
  livre: IconBook2,
  document: IconFiles,
  euro: IconWallet,
  etoile: IconStar,
  engrenage: IconSettings,
  accueil: IconHome2,
  activite: IconActivity,
  statistiques: IconChartBar,
  calendrier: IconCalendarEvent,
  utilisateur: IconUserCircle,
  entreprise: IconBuilding,
  carnet: IconAddressBook,
  tableau: IconChalkboard,
  planning: IconCalendarWeek,
  signature: IconSignature,
  emargement: IconClipboardCheck,
  certificat: IconCertificate,
  facture: IconFileInvoice,
  carte: IconCreditCard,
  portefeuille: IconWallet,
  liste: IconListCheck,
  immeuble: IconBuildingSkyscraper,
  bouclier: IconShieldLock,
  enveloppe: IconMail,
  robot: IconRobot,
  prise: IconPlug,
  code: IconCode,
  sondage: IconChecklist,
};

function IconeMenu({ nom, className }: { nom: string; className?: string }) {
  const Composant = ICONES[nom] ?? IconGauge;
  return <Composant className={className} stroke={1.75} aria-hidden="true" />;
}

export function BarreLaterale({ groupes, ouverte, onFermer }: Props) {
  const cheminActuel = usePathname();

  return (
    <>
      {ouverte && (
        <button
          type="button"
          aria-label="Fermer le menu"
          onClick={onFermer}
          className="fixed inset-0 z-20 bg-black/35 lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-3 left-3 z-30 flex w-64 flex-col rounded-2xl bg-barre transition-transform lg:translate-x-0 ${
          ouverte ? "translate-x-0" : "-translate-x-[calc(100%+0.75rem)]"
        }`}
      >
        <div className="flex shrink-0 items-center gap-2.5 px-4 py-5">
          <div className="flex size-9 items-center justify-center rounded-xl bg-accent text-white">
            <IconGauge className="size-5" stroke={1.75} aria-hidden="true" />
          </div>
          <div className="leading-tight">
            <div className="font-titre text-[15px] font-semibold text-barre-texte">
              Formalogy OS
            </div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-barre-texte-tenu">
              Centre de pilotage
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          {groupes.map((groupe) => (
            <div key={groupe.titre} className="mt-4 first:mt-0">
              <div className="px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-barre-texte-tenu">
                {groupe.titre}
              </div>

              {groupe.entrees.map((entree) => {
                if (!entree.chemin) {
                  return (
                    <div
                      key={entree.libelle}
                      title={`Module construit en Phase ${entree.phase}`}
                      className="flex cursor-default items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] text-barre-texte-tenu"
                    >
                      <IconeMenu nom={entree.icone} className="size-[18px] shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{entree.libelle}</span>
                      <span className="shrink-0 rounded-full bg-white/10 px-1.5 py-px font-texte text-[10px]">
                        P{entree.phase}
                      </span>
                    </div>
                  );
                }

                const actif = cheminActuel === entree.chemin;

                return (
                  <Link
                    key={entree.libelle}
                    href={entree.chemin}
                    onClick={onFermer}
                    aria-current={actif ? "page" : undefined}
                    className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] transition ${
                      actif
                        ? "bg-barre-actif font-medium text-barre-texte"
                        : "text-barre-texte-doux hover:bg-white/5 hover:text-barre-texte"
                    }`}
                  >
                    <IconeMenu
                      nom={entree.icone}
                      className={`size-[18px] shrink-0 ${actif ? "text-accent-clair" : ""}`}
                    />
                    <span className="min-w-0 flex-1 truncate">{entree.libelle}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-white/10 px-4 py-3 text-[11px] text-barre-texte-tenu">
          Les entrées grisées seront construites lors des phases indiquées.
        </div>
      </aside>
    </>
  );
}
