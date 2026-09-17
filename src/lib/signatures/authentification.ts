/// Vérifie qu'un email reçu par Gmail vient réellement de BoldSign.
///
/// Gmail ajoute en tête de chaque email reçu un en-tête « Authentication-Results »
/// indiquant si la signature cryptographique (DKIM) de l'expéditeur est valide.
/// Seul le premier de ces en-têtes (le plus haut, ajouté par Gmail lui-même)
/// fait foi : un expéditeur malveillant peut glisser de faux en-têtes plus bas
/// dans son message, jamais au-dessus de celui de Gmail.
///
/// `lignes` : en-têtes dans l'ordre du message, clés en minuscules.
export function emailAuthentifieBoldSign(lignes: readonly { key: string; line: string }[]): boolean {
  const premier = lignes.find((l) => l.key === "authentication-results");
  if (!premier) return false;

  const valeur = premier.line.replace(/^authentication-results:\s*/i, "").replace(/\s+/g, " ");
  // Le serveur qui a fait la vérification doit être celui de Gmail.
  if (!/^mx\.google\.com\s*;/i.test(valeur)) return false;

  // Au moins une signature DKIM valide, émise par le domaine boldsign.com
  // (ou l'un de ses sous-domaines), et rien derrière : « boldsign.com.pirate.fr »
  // est refusé.
  return valeur
    .split(";")
    .map((partie) => partie.trim())
    .some(
      (partie) =>
        /^dkim=pass\b/i.test(partie) &&
        /\bheader\.(?:i|d)=@?(?:[a-z0-9-]+\.)*boldsign\.com(?=\s|$)/i.test(partie),
    );
}
