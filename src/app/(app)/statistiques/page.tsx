import Link from "next/link";
import { redirect } from "next/navigation";

import {
  BarreProportion,
  BarresMensuelles,
  BarresNotes,
  Bloc,
  formaterNombre,
  formaterPourcent,
  Indicateur,
  Vide,
  type Part,
} from "@/app/(app)/statistiques/graphiques";
import { LIBELLE_RESULTAT } from "@/lib/attestations-pdf";
import { LIBELLE_PRESENCE } from "@/lib/emargement";
import { formaterMontant } from "@/lib/factures";
import { anneesDisponibles, calculerStatistiques } from "@/lib/statistiques";
import { exigerUtilisateur } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function PageStatistiques({ searchParams }: { searchParams: Promise<{ annee?: string }> }) {
  const utilisateur = await exigerUtilisateur();
  // Les formateurs n'ont accès ni aux prix ni aux chiffres de l'organisme.
  if (utilisateur.role === "FORMATEUR") redirect("/mes-sessions");

  const annees = await anneesDisponibles();
  const demandee = Number((await searchParams).annee);
  const annee = annees.includes(demandee) ? demandee : annees[0];
  const stats = await calculerStatistiques(annee);

  const { chiffreAffaires: ca, activite, assiduite, satisfaction, resultats } = stats;

  const partsAssiduite: Part[] = [
    { libelle: LIBELLE_PRESENCE.PRESENT, valeur: assiduite.parStatut.PRESENT, couleur: "bg-succes" },
    { libelle: LIBELLE_PRESENCE.ABSENT_JUSTIFIE, valeur: assiduite.parStatut.ABSENT_JUSTIFIE, couleur: "bg-graphique-neutre" },
    { libelle: LIBELLE_PRESENCE.ABSENT, valeur: assiduite.parStatut.ABSENT, couleur: "bg-danger" },
  ];

  const partsResultats: Part[] = [
    { libelle: LIBELLE_RESULTAT.ACQUIS, valeur: resultats.parResultat.ACQUIS, couleur: "bg-succes" },
    { libelle: LIBELLE_RESULTAT.PARTIELLEMENT_ACQUIS, valeur: resultats.parResultat.PARTIELLEMENT_ACQUIS, couleur: "bg-graphique-neutre" },
    { libelle: LIBELLE_RESULTAT.NON_ACQUIS, valeur: resultats.parResultat.NON_ACQUIS, couleur: "bg-danger" },
  ];

  return (
    <>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight">Statistiques</h1>
          <p className="mt-1 text-[12.8px] text-texte-doux">
            Chiffres de l&apos;année {annee}. Les sessions en brouillon et les sessions annulées n&apos;y figurent pas.
          </p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-lg border border-bordure bg-surface p-0.5">
          {annees.map((a) => (
            <Link
              key={a}
              href={`/statistiques?annee=${a}`}
              className={`rounded-md px-3 py-1 font-mono text-[12.5px] font-semibold tabular-nums ${a === annee ? "bg-accent-pale text-accent-fort" : "text-texte-doux"}`}
            >
              {a}
            </Link>
          ))}
        </div>
      </header>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Indicateur
          libelle="Chiffre d'affaires"
          valeur={formaterMontant(ca.factureHT / 100)}
          precision={`HT facturé · ${ca.nombreFactures} facture(s) émise(s)`}
        />
        <Indicateur
          libelle="Encaissé"
          valeur={formaterMontant(ca.encaisse / 100)}
          precision={`Paiements reçus en ${annee} · reste dû ${formaterMontant(ca.resteDu / 100)}`}
        />
        <Indicateur
          libelle="Sessions"
          valeur={formaterNombre(activite.nombreSessions)}
          precision={`${formaterNombre(activite.heures)} heures de formation dispensées`}
        />
        <Indicateur
          libelle="Apprenants formés"
          valeur={formaterNombre(activite.nombreApprenants)}
          precision={`${formaterNombre(activite.heuresStagiaires)} heures stagiaires`}
        />
      </div>

      <div className="flex flex-col gap-4">
        <Bloc titre="Chiffre d'affaires facturé, mois par mois" precision="Montants hors taxes des factures portant un numéro Henrri.">
          <BarresMensuelles parMois={ca.parMois} annee={annee} />
        </Bloc>

        <div className="grid gap-4 lg:grid-cols-2">
          <Bloc titre="Remplissage des sessions" precision="Places occupées sur les sessions dont le nombre de places est renseigné.">
            {activite.tauxRemplissage === null ? (
              <Vide message="Aucune session de cette année n'indique son nombre de places." />
            ) : (
              <>
                <p className="font-mono text-3xl font-semibold tabular-nums">{formaterPourcent(activite.tauxRemplissage)}</p>
                <p className="mt-1.5 text-[12.5px] text-texte-doux">
                  {activite.placesOccupees} place{activite.placesOccupees > 1 ? "s" : ""} occupée{activite.placesOccupees > 1 ? "s" : ""} sur{" "}
                  {activite.places} proposée{activite.places > 1 ? "s" : ""}.
                </p>
              </>
            )}
          </Bloc>

          <Bloc titre="Assiduité" precision="Demi-journées saisies sur les feuilles d'émargement.">
            {assiduite.total === 0 ? (
              <Vide message="Aucune présence saisie sur cette année." />
            ) : (
              <>
                <p className="font-mono text-3xl font-semibold tabular-nums">{formaterPourcent(assiduite.taux)}</p>
                <p className="mb-4 mt-1.5 text-[12.5px] text-texte-doux">de présence sur {assiduite.total} demi-journées.</p>
                <BarreProportion parts={partsAssiduite} total={assiduite.total} unite="présence" />
              </>
            )}
          </Bloc>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Bloc
            titre="Satisfaction des apprenants"
            precision={`Questionnaires « à chaud » : ${satisfaction.repondus} réponse(s) sur ${satisfaction.envoyes} envoi(s)${
              satisfaction.tauxReponse === null ? "" : ` (${formaterPourcent(satisfaction.tauxReponse)})`
            }.`}
          >
            {satisfaction.repondus === 0 ? (
              <Vide message="Aucune réponse reçue sur cette année." />
            ) : (
              <>
                <p className="font-mono text-3xl font-semibold tabular-nums">
                  {satisfaction.moyenne === null ? "—" : `${formaterNombre(Math.round(satisfaction.moyenne * 10) / 10)} / 5`}
                </p>
                <p className="mb-4 mt-1.5 text-[12.5px] text-texte-doux">note globale moyenne.</p>
                <BarresNotes lignes={satisfaction.parQuestion} />
              </>
            )}
          </Bloc>

          <Bloc titre="Résultats des évaluations" precision="Évaluation des acquis saisie à la fin de chaque session.">
            {resultats.total === 0 ? (
              <Vide message="Aucune évaluation saisie sur cette année." />
            ) : (
              <>
                <p className="font-mono text-3xl font-semibold tabular-nums">{formaterPourcent(resultats.taux)}</p>
                <p className="mb-4 mt-1.5 text-[12.5px] text-texte-doux">
                  d&apos;acquis sur {resultats.total} évaluation(s).
                </p>
                <BarreProportion parts={partsResultats} total={resultats.total} unite="évaluation" />
              </>
            )}
          </Bloc>
        </div>
      </div>
    </>
  );
}
