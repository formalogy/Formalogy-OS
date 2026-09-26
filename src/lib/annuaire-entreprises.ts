import "server-only";

/// Annuaire public des entreprises (répertoire Sirene de l'INSEE), service
/// gratuit et sans clé de l'État : https://recherche-entreprises.api.gouv.fr.
/// Interrogé depuis le serveur uniquement, pour pré-remplir une fiche
/// entreprise à partir de son SIRET.
const ADRESSE_API = "https://recherche-entreprises.api.gouv.fr/search";

export type EntrepriseTrouvee = {
  raisonSociale: string;
  siret: string;
  adresse: string | null;
  codePostal: string | null;
  ville: string | null;
  codeApe: string | null;
  /// Faux pour une entreprise ou un établissement fermé
  enActivite: boolean;
};

type Etablissement = {
  siret?: string;
  /// Adresse complète en un bloc, code postal et commune compris
  adresse?: string | null;
  numero_voie?: string | null;
  indice_repetition?: string | null;
  type_voie?: string | null;
  libelle_voie?: string | null;
  complement_adresse?: string | null;
  code_postal?: string | null;
  libelle_commune?: string | null;
  activite_principale?: string | null;
  etat_administratif?: string | null;
};

type Resultat = {
  nom_complet?: string;
  nom_raison_sociale?: string | null;
  activite_principale?: string | null;
  etat_administratif?: string | null;
  siege?: Etablissement;
  matching_etablissements?: Etablissement[];
};

/// « 85.59A » (notation de l'annuaire) devient « 8559A », la forme portée
/// sur le Kbis et les avis de situation.
export const normaliserCodeApe = (code: string) => code.replace(/[.\s]/g, "").toUpperCase();

/// Rue de l'établissement : complément (bâtiment, zone…), numéro, indice
/// (bis, ter…), type et libellé de voie. Pour un établissement précis,
/// l'annuaire ne donne que l'adresse en un bloc : on en retire alors le code
/// postal et la commune, repris dans leurs propres champs.
function rue(e: Etablissement): string | null {
  const voie = [e.numero_voie, e.indice_repetition, e.type_voie, e.libelle_voie].filter(Boolean).join(" ").trim();
  const complet = [e.complement_adresse, voie].filter(Boolean).join(", ").trim();
  if (complet) return complet;
  const bloc = e.adresse?.trim();
  if (!bloc) return null;
  const fin = [e.code_postal, e.libelle_commune].filter(Boolean).join(" ");
  const sansCommune = fin && bloc.toUpperCase().endsWith(fin.toUpperCase()) ? bloc.slice(0, bloc.length - fin.length).trim() : bloc;
  return sansCommune || null;
}

/// Entreprise correspondant à un SIRET (14 chiffres, l'établissement précis)
/// ou à un SIREN (9 chiffres, son siège). Null si l'annuaire ne la connaît pas.
export async function rechercherEntreprise(identifiant: string): Promise<EntrepriseTrouvee | null> {
  const numero = identifiant.replace(/\s/g, "");
  if (!/^\d{9}(\d{5})?$/.test(numero)) throw new Error("Un SIRET compte 14 chiffres (ou 9 pour un SIREN).");

  let reponse: Response;
  try {
    reponse = await fetch(`${ADRESSE_API}?q=${numero}&page=1&per_page=1`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
  } catch {
    throw new Error("L'annuaire des entreprises ne répond pas : réessayez dans un instant, ou remplissez la fiche à la main.");
  }
  if (!reponse.ok) throw new Error(`L'annuaire des entreprises a répondu par une erreur (${reponse.status}).`);

  const { results } = (await reponse.json()) as { results?: Resultat[] };
  const entreprise = results?.[0];
  if (!entreprise) return null;

  // Un SIRET désigne un établissement précis : son adresse, pas celle du siège.
  const etablissement =
    (numero.length === 14 ? entreprise.matching_etablissements?.find((e) => e.siret === numero) : undefined) ??
    (numero.length === 14 && entreprise.siege?.siret === numero ? entreprise.siege : undefined);
  if (numero.length === 14 && !etablissement) return null;
  const lieu = etablissement ?? entreprise.siege ?? {};

  const ape = lieu.activite_principale ?? entreprise.activite_principale;
  return {
    raisonSociale: entreprise.nom_raison_sociale || entreprise.nom_complet || "",
    siret: lieu.siret ?? numero,
    adresse: rue(lieu),
    codePostal: lieu.code_postal ?? null,
    ville: lieu.libelle_commune ?? null,
    codeApe: ape ? normaliserCodeApe(ape) : null,
    enActivite: (lieu.etat_administratif ?? entreprise.etat_administratif) !== "F" && entreprise.etat_administratif !== "C",
  };
}
