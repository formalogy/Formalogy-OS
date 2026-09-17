import type { Metadata } from "next";

import { FormulaireQuestionnaire } from "@/app/questionnaire/[jeton]/formulaire";
import { lireOrganisme } from "@/lib/organisme";
import { questionnaireParJeton } from "@/lib/satisfaction";
import { formaterPeriode } from "@/lib/sessions-libelles";

export const dynamic = "force-dynamic";

// Page personnelle : jamais indexée par les moteurs de recherche.
export const metadata: Metadata = { title: "Votre avis sur la formation", robots: { index: false, follow: false } };

/// Questionnaire de satisfaction, accessible sans compte grâce au lien
/// personnel reçu par email. Affiche le strict minimum : prénom et formation.
export default async function PageQuestionnaire({ params }: { params: Promise<{ jeton: string }> }) {
  const { jeton } = await params;
  const [q, organisme] = await Promise.all([questionnaireParJeton(jeton), lireOrganisme()]);

  const cadre = (contenu: React.ReactNode) => (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <p className="mb-6 text-[13px] font-bold text-texte-doux">{organisme.raisonSociale}</p>
      {contenu}
    </main>
  );

  if (!q || q.expireAt < new Date()) {
    return cadre(
      <div className="rounded-xl border border-bordure bg-surface p-6 shadow-sm">
        <p className="text-[16px] font-bold">Ce lien n&apos;est plus valable</p>
        <p className="mt-1 text-[13.5px] text-texte-doux">
          Il a peut-être expiré ou été remplacé par un lien plus récent. Contactez {organisme.raisonSociale} si vous souhaitez donner votre avis.
        </p>
      </div>,
    );
  }

  if (q.reponduAt) {
    return cadre(
      <div className="rounded-xl border border-bordure bg-surface p-6 text-center shadow-sm">
        <p className="text-[16px] font-bold">Vous avez déjà répondu</p>
        <p className="mt-1 text-[13.5px] text-texte-doux">Merci encore pour votre retour.</p>
      </div>,
    );
  }

  return cadre(
    <>
      <h1 className="text-[22px] font-extrabold tracking-tight">Bonjour {q.learner.prenom},</h1>
      <p className="mb-5 mt-1 text-[14px] text-texte-doux">
        Que pensez-vous de la formation « {q.session.formation.titre} » ({formaterPeriode(q.session.dateDebut, q.session.dateFin)}) ?
        Notez chaque point de 1 (pas du tout) à 5 (tout à fait).
      </p>
      <FormulaireQuestionnaire jeton={jeton} />
    </>,
  );
}
