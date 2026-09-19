import Link from "next/link";

import { exigerRole } from "@/lib/session";

export const dynamic = "force-dynamic";

const ROLES = [
  {
    nom: "Administrateur",
    pour: "Le dirigeant, ou toute personne devant tout piloter : comptes, argent, données sensibles.",
    peut: [
      "Tout ce que peut faire un gestionnaire",
      "Créer, désactiver et réactiver les comptes de l'équipe (« Utilisateurs »)",
      "Changer le rôle d'un compte, réinitialiser son mot de passe",
      "Ouvrir et fermer l'accès d'un formateur, régénérer son mot de passe",
      "Activer ou désactiver les automatisations",
      "Annuler une facture, supprimer un paiement, supprimer un document ou une action qualité",
    ],
  },
  {
    nom: "Gestionnaire",
    pour: "La personne qui gère le quotidien : apprenants, sessions, documents, facturation.",
    peut: [
      "Créer et modifier apprenants, entreprises, sessions, formations",
      "Déposer et organiser les documents, préparer et suivre les signatures",
      "Saisir les présences, préparer et émettre les factures, enregistrer les paiements",
      "Suivre les dossiers de financement et le référentiel Qualiopi",
      "Voir le statut des comptes de l'équipe, sans pouvoir les modifier",
    ],
  },
  {
    nom: "Formateur",
    pour: "Un intervenant extérieur, avec un accès limité à ses propres sessions.",
    peut: [
      "Voir uniquement ses sessions (hors brouillons) : dates, lieu, apprenants inscrits",
      "Saisir les présences de ses sessions",
      "Voir et télécharger les documents utiles à ses sessions (programme, convocation, émargement)",
      "Changer son propre mot de passe",
    ],
  },
];

const NE_PEUT_PAS_FORMATEUR = [
  "les prix et les notes internes",
  "les coordonnées et le financement des apprenants",
  "les sessions des autres formateurs",
  "les autres écrans de l'application (CRM, factures, paramètres…)",
];

/// Page de référence, pas un éditeur : l'application a délibérément trois
/// rôles fixes, sans table de permissions fines à configurer (voir CLAUDE.md).
/// Elle explique ce que chaque rôle peut faire, pour qui hésite en attribuant
/// un compte.
export default async function PageRoles() {
  await exigerRole("ADMIN");

  return (
    <>
      <header className="mb-6">
        <h1 className="text-[22px] font-extrabold tracking-tight">Rôles et permissions</h1>
        <p className="mt-1 max-w-2xl text-[12.8px] text-texte-doux">
          Formalogy OS utilise trois rôles fixes, sans réglage fin à configurer : c&apos;est un choix
          délibéré pour rester simple à comprendre et à auditer. Cette page explique ce que chaque rôle
          permet, pour choisir facilement lequel attribuer.
        </p>
      </header>

      <div className="flex flex-col gap-4">
        {ROLES.map((r) => (
          <section key={r.nom} className="rounded-xl border border-bordure bg-surface p-5 shadow-sm">
            <h2 className="text-[15px] font-bold">{r.nom}</h2>
            <p className="mt-0.5 text-[12.5px] text-texte-doux">{r.pour}</p>
            <ul className="mt-3 flex flex-col gap-1.5">
              {r.peut.map((ligne) => (
                <li key={ligne} className="flex gap-2 text-[12.8px]">
                  <span aria-hidden="true" className="text-succes">✓</span>
                  {ligne}
                </li>
              ))}
            </ul>
            {r.nom === "Formateur" && (
              <div className="mt-3 border-t border-bordure-douce pt-3">
                <p className="mb-1.5 text-[12px] font-semibold text-texte-tenu">Ne voit jamais :</p>
                <ul className="flex flex-col gap-1">
                  {NE_PEUT_PAS_FORMATEUR.map((ligne) => (
                    <li key={ligne} className="flex gap-2 text-[12px] text-texte-doux">
                      <span aria-hidden="true" className="text-danger">✕</span>
                      {ligne}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        ))}
      </div>

      <p className="mt-4 text-[12px] text-texte-tenu">
        Pour créer ou modifier un compte, direction{" "}
        <Link href="/parametres/utilisateurs" className="font-semibold text-accent-fort hover:underline">
          Utilisateurs
        </Link>
        , ou la fiche du formateur concerné.
      </p>
    </>
  );
}
