/// Adresse d'une entreprise sur une ligne, telle qu'on l'écrit comme lieu
/// d'une session « au sein de l'entreprise ».
export function adresseEntreprise(e: { raisonSociale: string; adresse: string | null; codePostal: string | null; ville: string | null }): string | null {
  const ville = [e.codePostal, e.ville].filter(Boolean).join(" ");
  const adresse = [e.adresse, ville].filter(Boolean).join(", ");
  return adresse ? `${e.raisonSociale} — ${adresse}` : null;
}
