/// Variables utilisables dans les modèles d'emails, avec leur description.
/// Cette liste sert à la fois à l'aide affichée dans l'éditeur et au contrôle
/// des modèles : une variable inconnue est signalée avant l'enregistrement.
export const VARIABLES_DISPONIBLES: Record<string, string> = {
  "organisme.nom": "Nom de l'organisme",
  "apprenant.prenom": "Prénom de l'apprenant",
  "apprenant.nom": "Nom de l'apprenant",
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
  "questionnaire.lien": "Lien personnel vers le questionnaire de satisfaction (emails de fin de session)",
  "questionnaire.lienPositionnement": "Lien personnel vers le questionnaire de positionnement (avant la formation)",
  "questionnaire.lienFroid": "Lien personnel vers le questionnaire à froid (60 jours après la formation)",
  "questionnaire.lienChaudFormateur": "Lien personnel vers le questionnaire à chaud du formateur",
  "questionnaire.lienFinanceur": "Lien personnel vers le questionnaire financeur",
  "questionnaire.lienSatisfactionFormateur": "Lien personnel vers le questionnaire annuel de satisfaction formateur",
};

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

function adresseApplication(): string {
  return (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/// Pixel invisible de suivi d'ouverture : son chargement par le client de
/// messagerie du destinataire appelle /api/emails/[id]/pixel, qui enregistre
/// l'ouverture. Comme tout suivi par pixel, ce n'est qu'un indice, pas une
/// preuve : certains clients bloquent les images, d'autres (Apple Mail) les
/// préchargent systématiquement même sans lecture réelle.
export function pixelSuivi(emailId: string): string {
  return `<img src="${adresseApplication()}/api/emails/${emailId}/pixel" width="1" height="1" alt="" style="display:none" />`;
}
