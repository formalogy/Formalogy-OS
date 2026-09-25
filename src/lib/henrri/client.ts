import "server-only";

/// Client HTTP pour l'API Henrri (facturation), environnement Sandbox tant
/// que Formalogy OS n'est pas en production.
///
/// Confirmé le 18/09/2026 depuis la documentation Scalar de Henrri
/// (https://api-sandbox.henrri.io/scalar) et son fichier OpenAPI
/// (https://api-sandbox.henrri.io/henrriapi/v1.json) :
/// - L'authentification se fait par `clientId` + `clientSecret`
///   (POST /v1/users/authenticate), PAS par une simple clé API. Le jeton
///   obtenu (`accessToken`) est valable 600 secondes.
/// - Les erreurs sont renvoyées au format standard ASP.NET « ProblemDetails »
///   ({ title, detail, status }).
/// - Les identifiants de type de document et de ligne (« Facture », « Ligne
///   d'article »…) ne sont pas fixes : ils s'obtiennent via
///   GET /v1/documenttypes et GET /v1/documentlinetypes.

export class HenrriError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "HenrriError";
  }
}

export class HenrriNonConfigure extends Error {
  constructor() {
    super(
      "La connexion à Henrri n'est pas configurée : renseignez HENRRI_API_BASE_URL, HENRRI_CLIENT_ID et HENRRI_CLIENT_SECRET dans .env.",
    );
  }
}

export function henrriConfigure(): boolean {
  return Boolean(process.env.HENRRI_API_BASE_URL && process.env.HENRRI_CLIENT_ID && process.env.HENRRI_CLIENT_SECRET);
}

function baseUrl(): string {
  return (process.env.HENRRI_API_BASE_URL ?? "").replace(/\/+$/, "");
}

// ---------------------------------------------------------------------------
// Jeton d'accès : mis en cache en mémoire le temps de sa validité (10 minutes),
// ré-authentifié ensuite. Un simple cache mémoire suffit au volume de cette
// application (quelques factures par jour au plus) ; inutile de le persister.
// ---------------------------------------------------------------------------

let jetonCache: { valeur: string; expireA: number } | null = null;

type ReponseJeton = {
  accessToken?: string;
  access_token?: string;
  expiresIn?: number;
  expires_in?: number;
};

/// Une panne réseau (Henrri injoignable ou trop lent) devient une erreur
/// lisible dans l'historique et au tableau de bord, au lieu du « fetch
/// failed » technique.
async function joindre(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    throw new HenrriError("Henrri ne répond pas (serveur injoignable ou trop lent) : réessayez plus tard avec « Relancer ».");
  }
}

async function authentifier(): Promise<string> {
  const reponse = await joindre(`${baseUrl()}/v1/users/authenticate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientId: process.env.HENRRI_CLIENT_ID,
      clientSecret: process.env.HENRRI_CLIENT_SECRET,
    }),
  });

  if (!reponse.ok) {
    throw new HenrriError(`Authentification Henrri refusée : ${await messageErreur(reponse)}`, reponse.status);
  }

  const donnees: ReponseJeton = await reponse.json();
  // La documentation illustrée de Henrri utilise des noms « snake_case »
  // (access_token), son schéma technique des noms « camelCase » (accessToken) :
  // les deux formes sont acceptées par prudence.
  const jeton = donnees.accessToken ?? donnees.access_token;
  const expiresIn = donnees.expiresIn ?? donnees.expires_in ?? 600;
  if (!jeton) throw new HenrriError("Réponse d'authentification Henrri sans jeton d'accès.");

  // Marge de 30 secondes pour ne jamais envoyer une requête avec un jeton
  // expiré entre-temps.
  jetonCache = { valeur: jeton, expireA: Date.now() + (expiresIn - 30) * 1000 };
  return jeton;
}

async function jetonValide(): Promise<string> {
  if (jetonCache && jetonCache.expireA > Date.now()) return jetonCache.valeur;
  return authentifier();
}

async function messageErreur(reponse: Response): Promise<string> {
  // Henrri renvoie soit un JSON « ProblemDetails » ({ detail, title }), parfois
  // enrichi d'un dictionnaire de validation ({ errors: { champ: [messages] } }),
  // soit, sur l'authentification, un simple texte façon OAuth2 (ex. « invalid_client »).
  const texte = await reponse.clone().text();
  try {
    const corps = JSON.parse(texte);
    const details = corps.errors
      ? Object.entries(corps.errors as Record<string, string[]>)
          .map(([champ, messages]) => `${champ} : ${messages.join(" ")}`)
          .join(" ; ")
      : "";
    return details || corps.detail || corps.title || corps.message || texte || `HTTP ${reponse.status}`;
  } catch {
    return texte.trim() || `HTTP ${reponse.status}`;
  }
}

/// Appelle l'API Henrri authentifiée. Ne renvoie jamais une réponse en échec
/// sans lever `HenrriError` avec un message exploitable.
export async function henrriFetch<T>(chemin: string, init: RequestInit = {}): Promise<T> {
  if (!henrriConfigure()) throw new HenrriNonConfigure();

  const appel = async (jeton: string) =>
    joindre(`${baseUrl()}${chemin}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${jeton}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });

  let reponse = await appel(await jetonValide());
  // Le jeton peut être révoqué côté Henrri avant son expiration annoncée :
  // une seule nouvelle tentative, avec un jeton fraîchement demandé.
  if (reponse.status === 401) {
    jetonCache = null;
    reponse = await appel(await authentifier());
  }
  if (!reponse.ok) {
    throw new HenrriError(`${init.method ?? "GET"} ${chemin} : ${await messageErreur(reponse)}`, reponse.status);
  }
  if (reponse.status === 204) return undefined as T;
  return reponse.json();
}

/// Télécharge un fichier depuis Henrri (l'URL de téléchargement du PDF exige
/// aussi le jeton d'accès).
export async function henrriTelecharger(url: string): Promise<Uint8Array> {
  const reponse = await joindre(url, { headers: { Authorization: `Bearer ${await jetonValide()}` } });
  if (!reponse.ok) throw new HenrriError(`Téléchargement du fichier Henrri impossible : HTTP ${reponse.status}`, reponse.status);
  return new Uint8Array(await reponse.arrayBuffer());
}
