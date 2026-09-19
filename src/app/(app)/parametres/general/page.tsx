import Link from "next/link";

import { formaterTaille } from "@/lib/documents-libelles";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";
import { QUOTA_STOCKAGE_OCTETS } from "@/lib/stockage";

export const dynamic = "force-dynamic";

export default async function PageParametresGeneraux() {
  await exigerRole("ADMIN");

  const [apprenantsAnonymises, storageInfo] = await Promise.all([
    prisma.learner.count({ where: { anonymiseAt: { not: null } } }),
    prisma.documentVersion.aggregate({ _sum: { taille: true } }),
  ]);
  const octetsUtilises = storageInfo._sum.taille ?? 0;

  return (
    <>
      <header className="mb-6">
        <h1 className="text-[22px] font-extrabold tracking-tight">Paramètres généraux</h1>
        <p className="mt-1 max-w-2xl text-[12.8px] text-texte-doux">
          Politique de données et limites techniques de l&apos;application.
        </p>
      </header>

      <section className="mb-4 max-w-2xl rounded-xl border border-bordure bg-surface p-5 shadow-sm">
        <h2 className="text-[15px] font-bold">Données personnelles (RGPD)</h2>
        <p className="mt-1 text-[12.5px] text-texte-doux">
          Les apprenants ont des fiches en base, jamais des comptes : ils n&apos;ont accès à aucun espace
          personnel. Deux actions répondent à leurs droits, accessibles depuis chaque fiche apprenant :
        </p>
        <ul className="mt-3 flex flex-col gap-2 text-[12.8px]">
          <li>
            <strong>Exporter ses données</strong> — remet un fichier reprenant toutes les informations
            personnelles détenues : identité, sessions suivies, présences, évaluations, réponses aux
            questionnaires, documents et emails. Accessible aux gestionnaires et aux administrateurs.
          </li>
          <li>
            <strong>Anonymiser (droit à l&apos;effacement)</strong> — remplace définitivement le nom, l&apos;email,
            le téléphone et l&apos;adresse. Les sessions, évaluations et factures restent, sans donnée
            personnelle : la loi impose de conserver les pièces comptables plusieurs années, et le
            référentiel Qualiopi exige de pouvoir retracer les formations réalisées. Réservé aux
            administrateurs, irréversible.
          </li>
        </ul>
        <p className="mt-3 text-[12px] text-texte-tenu">
          {apprenantsAnonymises === 0
            ? "Aucune fiche anonymisée pour l'instant."
            : `${apprenantsAnonymises} fiche${apprenantsAnonymises > 1 ? "s" : ""} anonymisée${apprenantsAnonymises > 1 ? "s" : ""} à ce jour.`}
        </p>
        <Link href="/apprenants" className="mt-3 inline-block text-[12.5px] font-semibold text-accent-fort hover:underline">
          Ouvrir la liste des apprenants →
        </Link>
      </section>

      <section className="max-w-2xl rounded-xl border border-bordure bg-surface p-5 shadow-sm">
        <h2 className="text-[15px] font-bold">Limites techniques</h2>
        <dl className="mt-3 flex flex-col gap-2 text-[12.8px]">
          <div className="flex justify-between gap-3">
            <dt className="text-texte-tenu">Stockage des documents</dt>
            <dd className="font-mono">
              {formaterTaille(octetsUtilises)} / {formaterTaille(QUOTA_STOCKAGE_OCTETS)}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-texte-tenu">Emails envoyés par 24 h</dt>
            <dd className="font-mono">400 (limite Gmail vers 500)</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-texte-tenu">Fuseau horaire</dt>
            <dd>Europe/Paris</dd>
          </div>
        </dl>
      </section>
    </>
  );
}
