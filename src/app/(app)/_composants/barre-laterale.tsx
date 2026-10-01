"use client";

import {
  IconActivity,
  IconArrowLeft,
  IconAddressBook,
  IconBook2,
  IconBuilding,
  IconBuildingSkyscraper,
  IconCalendarEvent,
  IconCalendarWeek,
  IconCertificate,
  IconChalkboard,
  IconChartBar,
  IconChevronRight,
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
import { useEffect, useLayoutEffect, useRef, useState } from "react";

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

/// Entrée qui correspond le mieux à la page affichée : son chemin, ou celui
/// dont la page est une sous-page (/sessions/… → Sessions). Le plus long
/// l'emporte (/crm/devis → Devis, pas CRM).
function meilleureEntree(groupes: GroupeMenu[], chemin: string): string | null {
  let meilleur: string | null = null;
  for (const e of groupes.flatMap((g) => g.entrees)) {
    if (!e.chemin) continue;
    if ((chemin === e.chemin || chemin.startsWith(`${e.chemin}/`)) && e.chemin.length > (meilleur?.length ?? 0)) meilleur = e.chemin;
  }
  return meilleur;
}

function LienEntree({ entree, actif, onChoisir }: { entree: GroupeMenu["entrees"][number]; actif: boolean; onChoisir: () => void }) {
  if (!entree.chemin) {
    return (
      <div
        title={`Module construit en Phase ${entree.phase}`}
        className="flex cursor-default items-center gap-2.5 rounded-full px-3.5 py-2 text-[13px] text-barre-texte-tenu"
      >
        <IconeMenu nom={entree.icone} className="size-[18px] shrink-0" />
        <span className="min-w-0 flex-1 truncate">{entree.libelle}</span>
        <span className="shrink-0 rounded-full bg-white/10 px-1.5 py-px font-texte text-[10px]">P{entree.phase}</span>
      </div>
    );
  }
  return (
    <Link
      href={entree.chemin}
      onClick={onChoisir}
      aria-current={actif ? "page" : undefined}
      className={`flex items-center gap-2.5 rounded-full px-3.5 py-2 text-[13px] transition ${FOCUS} ${actif ? PASTILLE_ACTIVE : PASTILLE_SURVOL}`}
    >
      <IconeMenu nom={entree.icone} className={`size-[18px] shrink-0 ${actif ? "text-accent-clair" : ""}`} />
      <span className="min-w-0 flex-1 truncate">{entree.libelle}</span>
    </Link>
  );
}

/// Surbrillance en pastille, sur le modèle choisi par le client (PDF Expert) :
/// l'entrée active se détache en capsule plus claire sur un bandeau translucide.
const PASTILLE_ACTIVE = "bg-white/[0.32] font-semibold text-white shadow-md ring-1 ring-white/40";
const PASTILLE_SURVOL = "text-barre-texte-doux hover:bg-white/[0.12] hover:text-barre-texte";
/// Contour de navigation au clavier, à la place du contour bleu du navigateur.
const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-white/70";
const BANDEAU = "rounded-[22px] bg-white/[0.05] p-1.5 ring-1 ring-white/[0.08]";

/// Menu en deux temps, sur le modèle choisi par le client (30/09/2026) : la
/// colonne ne montre que les grandes rubriques ; un clic sur l'une d'elles
/// ouvre à côté un panneau avec ses sous-menus, qui se referme dès qu'on a
/// choisi (ou d'un clic ailleurs, ou avec Échap). Une rubrique à une seule
/// entrée est un lien direct ; un menu d'une seule rubrique (formateur)
/// s'affiche à plat.
export function BarreLaterale({ groupes, ouverte, onFermer }: Props) {
  const cheminActuel = usePathname();
  const [deplie, setDeplie] = useState<string | null>(null);
  const barre = useRef<HTMLElement>(null);
  const panneau = useRef<HTMLDivElement>(null);
  const entreeActive = meilleureEntree(groupes, cheminActuel);
  const groupeActif = groupes.find((g) => g.entrees.some((e) => e.chemin && e.chemin === entreeActive))?.titre ?? null;
  const plat = groupes.length === 1;
  const groupeDeplie = groupes.find((g) => g.titre === deplie) ?? null;
  // Milieu vertical de la rubrique cliquée : le panneau se cale pour que son
  // premier sous-menu soit en face (Formations ↔ Catalogue).
  const [ancre, setAncre] = useState<number | null>(null);
  const [haut, setHaut] = useState<number | null>(null);
  useLayoutEffect(() => {
    const p = panneau.current;
    const premier = p?.querySelector("[data-entree]");
    if (!p || !premier || ancre === null || !window.matchMedia("(min-width: 1024px)").matches) {
      setHaut(null);
      return;
    }
    const cadre = p.getBoundingClientRect();
    const e = premier.getBoundingClientRect();
    const decalage = e.top + e.height / 2 - (haut ?? cadre.top);
    const voulu = ancre - decalage;
    const maxi = window.innerHeight - 12 - cadre.height;
    setHaut(Math.max(12, Math.min(voulu, maxi)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deplie, ancre]);

  // Le panneau se referme à chaque changement de page, d'un clic ailleurs ou avec Échap.
  const [cheminVu, setCheminVu] = useState(cheminActuel);
  if (cheminVu !== cheminActuel) {
    setCheminVu(cheminActuel);
    setDeplie(null);
  }
  useEffect(() => {
    if (!deplie) return;
    const clic = (e: MouseEvent) => {
      const cible = e.target as Node;
      if (!barre.current?.contains(cible) && !panneau.current?.contains(cible)) setDeplie(null);
    };
    const touche = (e: KeyboardEvent) => e.key === "Escape" && setDeplie(null);
    document.addEventListener("mousedown", clic);
    document.addEventListener("keydown", touche);
    return () => {
      document.removeEventListener("mousedown", clic);
      document.removeEventListener("keydown", touche);
    };
  }, [deplie]);

  const choisir = () => {
    setDeplie(null);
    onFermer();
  };

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
        ref={barre}
        className={`fixed inset-y-3 left-3 z-30 flex w-64 flex-col rounded-2xl bg-barre transition-transform lg:translate-x-0 ${
          ouverte ? "translate-x-0" : "-translate-x-[calc(100%+0.75rem)]"
        }`}
      >
        <div className="flex shrink-0 items-center gap-2.5 px-4 py-5">
          <div className="flex size-9 items-center justify-center rounded-xl bg-barre-logo text-white">
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
          <div className={BANDEAU}>
          {plat
            ? groupes[0].entrees.map((entree) => (
                <LienEntree key={entree.libelle} entree={entree} actif={entree.chemin === entreeActive} onChoisir={choisir} />
              ))
            : groupes.map((groupe) => {
                const surPage = groupe.titre === groupeActif;
                if (groupe.entrees.length === 1) {
                  return (
                    <div key={groupe.titre} className="mb-0.5">
                      <LienEntree
                        entree={{ ...groupe.entrees[0], libelle: groupe.titre, icone: groupe.icone }}
                        actif={surPage && !deplie}
                        onChoisir={choisir}
                      />
                    </div>
                  );
                }
                const ouvert = deplie === groupe.titre;
                return (
                  <button
                    key={groupe.titre}
                    type="button"
                    aria-expanded={ouvert}
                    aria-controls="sous-menu"
                    onClick={(ev) => {
                      const r = ev.currentTarget.getBoundingClientRect();
                      setAncre(r.top + r.height / 2);
                      setDeplie(ouvert ? null : groupe.titre);
                    }}
                    className={`mb-0.5 flex w-full items-center gap-2.5 rounded-full px-3.5 py-2.5 text-left text-[13.5px] transition ${FOCUS} ${
                      ouvert || (surPage && !deplie) ? PASTILLE_ACTIVE : PASTILLE_SURVOL
                    }`}
                  >
                    <IconeMenu nom={groupe.icone} className={`size-[18px] shrink-0 ${surPage ? "text-accent-clair" : ""}`} />
                    <span className="min-w-0 flex-1 truncate">{groupe.titre}</span>
                    <IconChevronRight className={`size-4 shrink-0 transition ${ouvert ? "translate-x-0.5" : ""}`} stroke={1.75} aria-hidden="true" />
                  </button>
                );
              })}
          </div>
        </nav>
      </aside>

      {/* Sous-menus de la rubrique choisie : à côté de la colonne sur grand
          écran, par-dessus sur téléphone (avec un retour). */}
      {groupeDeplie && (
        <div
          ref={panneau}
          id="sous-menu"
          style={haut !== null ? { top: haut } : undefined}
          className="fixed inset-y-3 left-3 z-40 flex w-64 flex-col rounded-2xl bg-barre shadow-2xl lg:bottom-auto lg:left-[17.25rem] lg:max-h-[calc(100vh-1.5rem)] lg:w-60"
        >
          <div className="flex shrink-0 items-center gap-2 px-4 pb-3 pt-5">
            <button
              type="button"
              onClick={() => setDeplie(null)}
              aria-label="Revenir aux rubriques"
              className="flex size-7 items-center justify-center rounded-lg text-barre-texte-doux hover:bg-white/5 hover:text-barre-texte lg:hidden"
            >
              <IconArrowLeft className="size-4" stroke={1.75} aria-hidden="true" />
            </button>
            <span className="text-[10.5px] font-semibold uppercase tracking-wider text-barre-texte-tenu">{groupeDeplie.titre}</span>
          </div>
          <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label={groupeDeplie.titre}>
            <div className={BANDEAU}>
              {groupeDeplie.entrees.map((entree, i) => (
                <div key={entree.libelle} data-entree={i === 0 ? "" : undefined}>
                  <LienEntree entree={entree} actif={entree.chemin === entreeActive} onChoisir={choisir} />
                </div>
              ))}
            </div>
          </nav>
        </div>
      )}
    </>
  );
}
