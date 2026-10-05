import Link from "next/link";

import { FeuillesSignees } from "@/app/(app)/_composants/feuilles-signees";
import { GrilleEmargement } from "@/app/(app)/_composants/grille-emargement";
import { SignaturesEmargement } from "@/app/(app)/_composants/signatures-emargement";
import { clePresence, joursDeSession, nombreAbsences } from "@/lib/emargement";
import type { sessionPourEmargement } from "@/lib/emargement-acces";
import { suiviSignatures } from "@/lib/emargement-numerique";
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
export async function ContenuEmargement({ session, lienRetour, lienDepot }: Props) {
  const aujourdhui = aujourdhuiUTC();
  const jours = joursDeSession(session.dateDebut, session.dateFin, session.jours);
  const presences = Object.fromEntries(session.presences.map((p) => [clePresence(p.learnerId, p.jour, p.creneau), p.statut]));
  const absences = nombreAbsences(session.presences);
  const commencee = session.dateDebut <= aujourdhui;
  const participants = await suiviSignatures(session);

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
        <div className="flex flex-wrap gap-2">
          <a
            href={`/api/sessions/${session.id}/qr-emargement`}
            target="_blank"
            rel="noopener"
            className="rounded-lg border border-bordure bg-surface px-4 py-2 text-[13px] font-semibold text-accent-fort"
          >
            QR codes (PDF)
          </a>
          <a
            href={`/api/sessions/${session.id}/feuille-emargement`}
            target="_blank"
            rel="noopener"
            className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white"
          >
            Feuilles d&apos;émargement (PDF)
          </a>
        </div>
      </header>

      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        <p className="rounded-xl border border-bordure bg-surface px-4 py-3 text-[12.5px] text-texte-doux shadow-sm">
          <strong className="text-texte">1. Faire signer.</strong> Chaque participant signe chaque demi-journée en ligne,
          avec son lien personnel (reçu par email le premier jour) ou son QR code. Qui n&apos;a pas signé est relancé en fin
          de demi-journée ; dès que tout le monde a signé, la feuille du jour se range seule ci-dessous. En secours, la
          feuille papier signée se renvoie par email ou se dépose ici.
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
        <div className="border-b border-bordure-douce px-4 py-3">
          <h2 className="text-[14.5px] font-bold">Signatures</h2>
          <p className="mt-0.5 text-[12px] text-texte-tenu">
            Ouvrez un participant pour voir chacune de ses séances. Une séance se signe le jour même, à partir de son début.
          </p>
        </div>
        <SignaturesEmargement participants={participants} />
      </section>

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
              enCours: j.getTime() === aujourdhui.getTime(),
              feuille: feuille ? { recue: dateHeure.format(feuille.createdAt), origine: feuille.origine, documentId: feuille.documentId } : null,
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
