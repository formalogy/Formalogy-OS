import type { Metadata } from "next";

import { PaveSignature } from "@/app/emargement/[jeton]/pave-signature";
import { horairesDemiJournees, LIBELLE_CRENEAU } from "@/lib/emargement";
import { heureLisible, participationParJeton, seancesDuParticipant, type EtatSeance } from "@/lib/emargement-numerique";
import { lireOrganisme } from "@/lib/organisme";
import { formaterPeriode, jourVersSaisie } from "@/lib/sessions-libelles";

export const dynamic = "force-dynamic";

// Page personnelle : jamais indexée, jamais transmise à un autre site.
export const metadata: Metadata = { title: "Émargement", robots: { index: false, follow: false }, referrer: "no-referrer" };

const jourLong = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const heure = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

function Etat({ etat }: { etat: EtatSeance }) {
  const [texte, ton] =
    etat.etat === "signee"
      ? [`Signée à ${heure.format(etat.signeAt)}`, "bg-succes/12 text-succes"]
      : etat.etat === "ouverte"
        ? ["À signer", "bg-accent-pale text-accent-fort"]
        : etat.etat === "absent"
          ? ["Absence signalée", "bg-surface-creuse text-texte-doux"]
          : etat.etat === "a_venir"
            ? [etat.ouverture !== null ? `À partir de ${heureLisible(etat.ouverture)}` : "À venir", "bg-surface-creuse text-texte-tenu"]
            : ["Non signée", "bg-danger-pale text-danger"];
  return <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${ton}`}>{texte}</span>;
}

/// Page de signature d'un participant : la séance ouverte à signer, puis
/// l'état de toutes ses séances.
export default async function PageEmargement({ params }: { params: Promise<{ jeton: string }> }) {
  const { jeton } = await params;
  const [participation, organisme] = await Promise.all([participationParJeton(jeton), lireOrganisme()]);

  const cadre = (contenu: React.ReactNode) => (
    <main className="mx-auto w-full max-w-xl px-4 py-8">
      <p className="mb-6 text-[13px] font-bold text-texte-doux">{organisme.raisonSociale}</p>
      {contenu}
    </main>
  );

  if (!participation) {
    return cadre(
      <div className="rounded-xl border border-bordure bg-surface p-6 shadow-sm">
        <p className="text-[16px] font-bold">Ce lien n&apos;est plus valable</p>
        <p className="mt-1 text-[13.5px] text-texte-doux">
          La session a peut-être été annulée, ou votre inscription modifiée. Adressez-vous à votre formateur ou à {organisme.raisonSociale}.
        </p>
      </div>,
    );
  }

  const { session, personne } = participation;
  const horaires = horairesDemiJournees(session.horaires);
  const seances = seancesDuParticipant(session, participation.signatures, participation.absences);
  const aSigner = seances.find((s) => s.etat.etat === "ouverte");
  const intitule = (jour: Date, creneau: keyof typeof LIBELLE_CRENEAU) =>
    `${LIBELLE_CRENEAU[creneau]} du ${jourLong.format(jour)}${horaires[creneau] ? ` (${horaires[creneau]})` : ""}`;

  return cadre(
    <>
      <header className="mb-5">
        <h1 className="text-[22px] font-extrabold tracking-tight">Émargement</h1>
        <p className="mt-1 text-[13.5px] font-semibold text-texte-doux">
          « {session.formation.titre} » — {formaterPeriode(session.dateDebut, session.dateFin)}
          {session.lieu ? ` · ${session.lieu}` : ""}
        </p>
        <p className="mt-3 text-[14px] text-texte-doux">
          Bonjour {personne.prenom} {personne.nom},{" "}
          {participation.formateur
            ? "signez chaque demi-journée que vous animez, comme les apprenants."
            : "signez à chaque demi-journée de formation, au début de la séance."}
        </p>
      </header>

      {aSigner ? (
        <PaveSignature
          key={`${jourVersSaisie(aSigner.jour)}-${aSigner.creneau}`}
          jeton={jeton}
          jour={jourVersSaisie(aSigner.jour)}
          creneau={aSigner.creneau}
          intitule={intitule(aSigner.jour, aSigner.creneau)}
        />
      ) : (
        <div className="rounded-xl border border-bordure bg-surface p-5 text-center shadow-sm">
          <p className="text-[15px] font-bold">Rien à signer pour le moment</p>
          <p className="mt-1 text-[13px] text-texte-doux">
            Chaque séance se signe le jour même, à partir de son début. Gardez ce lien : il sert pour toute la formation.
          </p>
        </div>
      )}

      <section className="mt-6 overflow-hidden rounded-xl border border-bordure bg-surface shadow-sm">
        <h2 className="border-b border-bordure-douce px-4 py-3 text-[14px] font-bold">Vos séances</h2>
        <ul>
          {seances.map((s) => (
            <li key={`${s.jour.getTime()}-${s.creneau}`} className="flex items-center justify-between gap-3 border-t border-bordure-douce px-4 py-2.5 first:border-t-0">
              <span className="text-[13px]">
                <span className="font-semibold first-letter:uppercase">{jourLong.format(s.jour)}</span>
                <span className="text-texte-doux"> · {LIBELLE_CRENEAU[s.creneau].toLowerCase()}</span>
              </span>
              <Etat etat={s.etat} />
            </li>
          ))}
        </ul>
      </section>
      <p className="mt-4 text-[11.5px] text-texte-tenu">
        Signature électronique simple : l&apos;heure, l&apos;appareil utilisé, l&apos;adresse réseau et l&apos;empreinte de votre signature sont conservés par{" "}
        {organisme.raisonSociale} comme preuve de votre présence.
      </p>
    </>,
  );
}
