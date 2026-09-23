/// Les champs longs d'une formation (description, programme, …) contiennent
/// du texte enrichi (gras, italique, souligné, police) saisi via l'éditeur de
/// la page Formations, stocké en HTML. Les fiches créées avant cet éditeur
/// contiennent du texte brut avec des sauts de ligne : les deux cohabitent,
/// ces fonctions n'utilisent aucune API Node et sont utilisables aussi bien
/// dans l'éditeur (client) que côté serveur.

/// Un contenu antérieur à l'éditeur enrichi est du texte brut : aucune balise.
export function estHtmlFormation(valeur: string): boolean {
  return /<[a-z][\s\S]*>/i.test(valeur);
}

function echapperHtml(texte: string): string {
  return texte.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/// Convertit un texte brut existant (avant l'éditeur enrichi) en HTML
/// équivalent, pour l'afficher ou le rouvrir dans l'éditeur sans perdre ses
/// sauts de ligne. Sans effet sur un contenu déjà en HTML.
export function texteFormationVersHtml(valeur: string): string {
  if (!valeur.trim() || estHtmlFormation(valeur)) return valeur;
  return valeur
    .split(/\n{2,}/)
    .map((p) => `<p>${echapperHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}
