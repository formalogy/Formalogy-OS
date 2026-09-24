import type { Metadata } from "next";

import { EnTeteQuestionnaire } from "@/app/_composants/en-tete-questionnaire";
import { FormulaireQuestionnaire } from "@/app/_composants/formulaire-questionnaire";
import { repondreQuestionnaireQualite } from "@/app/questionnaires/actions";
import { lireOrganisme } from "@/lib/organisme";
import { questionnaireQualiteParJeton } from "@/lib/questionnaires";
import { lireContenuQuestionnaire } from "@/lib/questionnaires-modeles";
import { formaterPeriode } from "@/lib/sessions-libelles";

export const dynamic = "force-dynamic";

// Page personnelle : jamais indexée par les moteurs de recherche.
export const metadata: Metadata = { title: "Questionnaire", robots: { index: false, follow: false } };

function nomDestinataire(q: NonNullable<Awaited<ReturnType<typeof questionnaireQualiteParJeton>>>): string {
  if (q.learner) return q.learner.prenom;
  if (q.trainer) return q.trainer.prenom;
  if (q.dossier) return q.dossier.financeurNom;
  return "";
}

export default async function PageQuestionnaireQualite({ params }: { params: Promise<{ jeton: string }> }) {
  const { jeton } = await params;
  const [q, organisme] = await Promise.all([questionnaireQualiteParJeton(jeton), lireOrganisme()]);

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
          Il a peut-être expiré ou été remplacé par un lien plus récent. Contactez {organisme.raisonSociale} si vous souhaitez répondre.
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

  const { contenu } = await lireContenuQuestionnaire(q.type);
  return cadre(
    <>
      <EnTeteQuestionnaire
        titre={contenu.titre}
        contexte={q.session ? `« ${q.session.formation.titre} » — ${formaterPeriode(q.session.dateDebut, q.session.dateFin)}` : undefined}
        prenom={nomDestinataire(q)}
        introduction={contenu.introduction}
      />
      <FormulaireQuestionnaire questions={contenu.questions} action={repondreQuestionnaireQualite} jeton={jeton} />
    </>,
  );
}
