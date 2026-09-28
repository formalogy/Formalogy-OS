import Link from "next/link";

import { FeuillesSignees } from "@/app/(app)/_composants/feuilles-signees";
import { GrilleEmargement } from "@/app/(app)/_composants/grille-emargement";
import { clePresence, joursDeSession, nombreAbsences } from "@/lib/emargement";
import type { sessionPourEmargement } from "@/lib/emargement-acces";
import { aujourdhuiUTC, formaterPeriode, jourVersSaisie } from "@/lib/sessions-libelles";

const jourCourt = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const jourLong = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const dateHeure = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

type Props = {
  session: NonNullable<Awaited<ReturnType<typeof sessionPourEmargement>>>;
  lienRetour: string;
  /// Lien de dépôt de la feuille signée, réservé à l'équipe
  lienDepot?: string;
};

/// Écran d'émargement commun à l'équipe et aux formateurs.
export function ContenuEmargement({ session, lienRetour, lienDepot }: Props) {
  const aujourdhui = aujourdhuiUTC();
  const jours = joursDeSession(session.dateDebut, session.dateFin);
  const presences = Object.fromEntries(session.presences.map((p) => [clePresence(p.learnerId, p.jour, p.creneau), p.statut]));
  const absences = nombreAbsences(session.presences);
  const commencee = session.dateDebut <= aujourdhui;

  return (
    <>
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={lienRetour} className="text-[12.5px] font-semibold text-accent-fort hover:underline">
            ← {session.numero}
          </Link>
          <h1 className="mt-2 text-[22px] font-extrabold tracking-tight">Émargement</h1>
          <p className="mt-1 text-[12.5px] text-texte-doux">
            {session.formation.titre} · {formaterPeriode(session.dateDebut, session.dateFin)}
          </p>
        </div>
        <a
          href={`/api/sessions/${session.id}/feuille-emargement`}
          target="_blank"
          rel="noopener"
          className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white"
        >
          Feuilles d&apos;émargement (PDF)
        </a>
      </header>

      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        <p className="rounded-xl border border-bordure bg-surface px-4 py-3 text-[12.5px] text-texte-doux shadow-sm">
          <strong className="text-texte">1. Faire signer.</strong> Le formateur reçoit chaque matin la feuille du jour
          (une page par demi-journée) et la renvoie signée en répondant à cet email : elle se range seule ci-dessous. À
          défaut, déposez-la jour par jour. Tant qu&apos;une feuille manque, le formateur est relancé à 18 h.
        </p>
        <p className="rounded-xl border border-bordure bg-surface px-4 py-3 text-[12.5px] text-texte-doux shadow-sm">
          <strong className="text-texte">2. Signaler les absences</strong> ci-dessous. Une demi-journée sans saisie compte
          comme une présence : quand tout le monde est là, il n&apos;y a rien à faire.{" "}
          {!commencee ? (
            "La session n'a pas encore commencé."
          ) : (
            <span className={absences ? "font-semibold text-alerte" : "font-semibold text-succes"}>
              {absences === 0 ? "Aucune absence signalée." : `${absences} absence${absences > 1 ? "s" : ""} signalée${absences > 1 ? "s" : ""}.`}
            </span>
          )}
        </p>
      </div>

      <section className="mb-4 overflow-hidden rounded-xl border border-bordure bg-surface shadow-sm">
        <h2 className="border-b border-bordure-douce px-4 py-3 text-[14.5px] font-bold">Feuilles signées</h2>
        <FeuillesSignees
          sessionId={session.id}
          lienDocument={Boolean(lienDepot)}
          jours={jours.map((j) => {
            const feuille = session.feuillesSignees.find((f) => f.jour.getTime() === j.getTime());
            return {
              cle: jourVersSaisie(j),
              libelle: jourLong.format(j),
              passe: j <= aujourdhui,
              feuille: feuille
                ? { recue: dateHeure.format(feuille.createdAt), parEmail: feuille.origine === "EMAIL", documentId: feuille.documentId }
                : null,
            };
          })}
        />
      </section>

      <GrilleEmargement
        sessionId={session.id}
        jours={jours.map((j) => ({ cle: jourVersSaisie(j), libelle: jourCourt.format(j), passe: j <= aujourdhui }))}
        apprenants={session.inscriptions.map((i) => ({
          id: i.learner.id,
          nom: `${i.learner.prenom} ${i.learner.nom}`,
          detail: i.learner.company?.raisonSociale,
        }))}
        presences={presences}
      />
    </>
  );
}
