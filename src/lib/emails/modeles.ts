import { adressePublique } from "@/lib/adresse-publique";

/// Variables utilisables dans les modèles d'emails, avec leur description.
/// Cette liste sert à la fois à l'aide affichée dans l'éditeur et au contrôle
/// des modèles : une variable inconnue est signalée avant l'enregistrement.
export const VARIABLES_DISPONIBLES: Record<string, string> = {
  "organisme.nom": "Nom de l'organisme",
  "organisme.telephone": "Téléphone de l'organisme (Paramètres → Organisme)",
  "organisme.email": "Adresse email de l'organisme",
  "plateforme.nom": "Plateforme en ligne de la formation (E-forma ou Mon Parcours En Ligne)",
  "plateforme.adresse": "Adresse de la plateforme en ligne de la formation (Paramètres → Organisme)",
  "formation.duree": "Durée de la formation en heures (ex. 14 heures)",
  "apprenant.prenom": "Prénom de l'apprenant",
  "apprenant.nom": "Nom de l'apprenant",
  "apprenant.email": "Adresse email de l'apprenant (identifiant de la plateforme en ligne)",
  "apprenant.motDePasse": "Mot de passe de première connexion à la plateforme : initiales suivies de 12345 (ex. CE12345)",
  "formateur.prenom": "Prénom du formateur destinataire",
  "formateur.nom": "Nom du formateur destinataire",
  "session.numero": "Numéro de la session",
  "session.formation": "Titre de la formation",
  "session.dates": "Dates de la session",
  "session.horaires": "Horaires de la session",
  "session.lieu": "Lieu de la session",
  "session.modalite": "Modalité (présentiel, distanciel…)",
  "session.formateur": "Prénom et nom du formateur",
  "entreprise.nom": "Raison sociale de l'entreprise",
  "prospect.nomComplet": "Prénom et nom du prospect",
  "dossier.financeur": "Nom du financeur (dossier de prise en charge)",
  "dossier.reference": "Numéro du dossier de financement",
  "facture.numero": "Numéro de la facture (email d'envoi de la facture)",
  "emargement.jours": "Jours dont la feuille d'émargement signée n'est pas arrivée (relance du formateur)",
  "emargement.lien": "Lien personnel de signature de l'émargement (apprenant ou formateur destinataire)",
  "emargement.seance": "Demi-journée à signer, en toutes lettres (relance de signature)",
  "emargement.manquants": "Signatures d'émargement manquantes, jour par jour (relance du formateur)",
  "devis.numero": "Numéro du devis (relance de devis)",
  "devis.date": "Date du devis",
  "devis.montant": "Montant HT du devis",
  "devis.objet": "Objet du devis, tel que saisi dans Henrri",
  "devis.client": "Client du devis",
  "devis.contact": "Contact du client du devis (à défaut, le client)",
  "qualiopi.dateAudit": "Date du prochain audit Qualiopi",
  "qualiopi.bilan": "Où en est la préparation Qualiopi (indicateurs conformes)",
  "qualiopi.aVerifier": "Indicateurs à reprendre avant l'audit (non conformes, ou sans preuve déposée)",
  "qualiopi.lien": "Lien vers l'onglet Qualiopi de Formalogy OS",
  "synthese.periode": "Semaine couverte par le planning du formateur",
  "synthese.sessions": "Sessions du formateur dans la semaine (planning hebdomadaire)",
  "facture.montant": "Montant TTC de la facture",
  "questionnaire.lien": "Lien personnel vers le questionnaire de satisfaction (emails de fin de session)",
  "questionnaire.lienPositionnement": "Lien personnel vers le questionnaire de positionnement (avant la formation)",
  "questionnaire.lienFroid": "Lien personnel vers le questionnaire à froid (60 jours après la formation)",
  "questionnaire.lienChaudFormateur": "Lien personnel vers le questionnaire à chaud du formateur",
  "questionnaire.lienFinanceur": "Lien personnel vers le questionnaire financeur",
  "questionnaire.lienSatisfactionFormateur": "Lien personnel vers le questionnaire annuel de satisfaction formateur",
};

/// Mot de passe de première connexion à la plateforme en ligne, selon la
/// règle de l'organisme (client, 01/10/2026) : initiales du prénom et du nom,
/// en majuscules et sans accent, suivies de 12345 — Camille Exemple → CE12345.
export function motDePasseInitial(prenom: string, nom: string): string {
  const initiale = (mot: string) => mot.trim().normalize("NFD").replace(/[^A-Za-z]/g, "").charAt(0).toUpperCase();
  return `${initiale(prenom)}${initiale(nom)}12345`;
}

export type Contexte = Partial<Record<keyof typeof VARIABLES_DISPONIBLES | string, string | null | undefined>>;

const MOTIF_VARIABLE = /\{\{\s*([a-zA-Z]+\.[a-zA-Z]+)\s*\}\}/g;

export function variablesUtilisees(texte: string): string[] {
  return [...new Set([...texte.matchAll(MOTIF_VARIABLE)].map((m) => m[1]))];
}

export function variablesInconnues(texte: string): string[] {
  return variablesUtilisees(texte).filter((v) => !(v in VARIABLES_DISPONIBLES));
}

/// Remplace les variables par leur valeur. Une variable sans valeur dans ce
/// contexte (lieu non renseigné, par exemple) devient « non précisé » plutôt
/// qu'un trou dans la phrase, et elle est signalée à l'appelant.
export function rendre(texte: string, contexte: Contexte): { resultat: string; manquantes: string[] } {
  const manquantes: string[] = [];
  const resultat = texte.replace(MOTIF_VARIABLE, (_, nom: string) => {
    const valeur = contexte[nom];
    if (valeur === null || valeur === undefined || valeur === "") {
      manquantes.push(nom);
      return "non précisé";
    }
    return valeur;
  });
  return { resultat, manquantes: [...new Set(manquantes)] };
}

function echapperHtml(texte: string): string {
  return texte
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/// Version HTML d'un corps de texte. Tout est échappé : les valeurs insérées
/// (un nom d'apprenant, un lieu) ne peuvent jamais injecter de balises.
export function texteVersHtml(texte: string): string {
  const paragraphes = texte
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px">${echapperHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#1b2422;max-width:600px">${paragraphes}</div>`;
}


/// Pixel invisible de suivi d'ouverture : son chargement par le client de
/// messagerie du destinataire appelle /api/emails/[id]/pixel, qui enregistre
/// l'ouverture. Comme tout suivi par pixel, ce n'est qu'un indice, pas une
/// preuve : certains clients bloquent les images, d'autres (Apple Mail) les
/// préchargent systématiquement même sans lecture réelle.
export function pixelSuivi(emailId: string): string {
  return `<img src="${adressePublique()}/api/emails/${emailId}/pixel" width="1" height="1" alt="" style="display:none" />`;
}
