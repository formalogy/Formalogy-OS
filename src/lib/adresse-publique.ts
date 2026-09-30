/// Adresse des liens envoyés hors de l'application — émargement, QR codes,
/// questionnaires, suivi d'ouverture des emails : ADRESSE_PUBLIQUE si elle est
/// renseignée, sinon l'adresse de l'application. En local, ADRESSE_PUBLIQUE
/// vaut l'adresse du Mac sur le Wi-Fi (http://192.168.x.x:3000) : un
/// téléphone du même réseau peut alors ouvrir les liens, ce que « localhost »
/// ne permet pas. Une fois en ligne, les deux adresses sont la même.
export function adressePublique(): string {
  return (process.env.ADRESSE_PUBLIQUE || process.env.BETTER_AUTH_URL || "http://localhost:3000").replace(/\/$/, "");
}
