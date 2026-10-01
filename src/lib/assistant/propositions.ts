import { z } from "zod";

/// Ce que l'assistant IA peut proposer de faire. Il ne fait jamais rien seul :
/// chaque proposition s'affiche dans la conversation et ne s'exécute qu'au
/// clic « Valider » de l'utilisateur, avec les mêmes contrôles que les
/// formulaires de l'application.

const texte = z.string().trim().max(2000).optional();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date au format AAAA-MM-JJ.");

export const schemaFacturationProposee = z.object({
  sessionId: z.string().min(1),
  facturerA: z.enum(["ENTREPRISE", "OPCO", "FRANCE_TRAVAIL", "CAISSE_DES_DEPOTS", "APPRENANT"]),
  prixHT: z.string().min(1),
  financeurNom: texte,
  financeurReference: texte,
  financeurEmail: texte,
});

export const schemaProposition = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("APPRENANT"),
    apprenant: z.object({
      prenom: z.string().min(1),
      nom: z.string().min(1),
      email: texte,
      telephone: texte,
      dateNaissance: date.optional(),
      adresse: texte,
      codePostal: texte,
      ville: texte,
      niveauEtudes: texte,
      companyId: texte,
      financement: z.enum(["ENTREPRISE", "OPCO", "CPF", "FRANCE_TRAVAIL", "PERSONNEL", "AUTRE"]),
      numeroDossierCpf: texte,
      notes: texte,
    }),
    /// Inscription dans la foulée, facultative.
    inscription: schemaFacturationProposee.optional(),
  }),
  z.object({
    type: z.literal("INSCRIPTION"),
    learnerId: z.string().min(1),
    inscription: schemaFacturationProposee,
  }),
  z.object({
    type: z.literal("SESSION"),
    formationId: z.string().min(1),
    dateDebut: date,
    dateFin: date,
    horaires: texte,
    lieu: texte,
    modalite: z.enum(["PRESENTIEL", "DISTANCIEL", "E_LEARNING", "HYBRIDE"]),
    trainerId: texte,
    companyId: texte,
    placesMax: texte,
    notes: texte,
  }),
  z.object({
    type: z.literal("ABSENCE"),
    sessionId: z.string().min(1),
    learnerId: z.string().min(1),
    jour: date,
    creneau: z.enum(["MATIN", "APRES_MIDI"]),
    justifiee: z.boolean().default(false),
  }),
  z.object({
    type: z.literal("DEROULEMENT"),
    sessionId: z.string().min(1),
    operation: z.enum(["suspendre", "reprendre", "annuler"]),
  }),
]);

export type Proposition = z.infer<typeof schemaProposition>;

/// Proposition telle qu'elle s'affiche : son contenu, un titre et le détail
/// lisible (noms retrouvés en base, jamais repris tels quels de l'IA).
export type PropositionAffichee = {
  id: string;
  titre: string;
  lignes: string[];
  proposition: Proposition;
};
