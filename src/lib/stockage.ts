import "server-only";

import { StorageClient } from "@supabase/storage-js";

/// Espace de stockage des fichiers.
///
/// Le reste de l'application ne connaît que cette interface : passer de
/// Supabase Storage à Cloudflare R2 (ou autre) ne demande de réécrire que
/// l'implémentation ci-dessous.
///
/// Les fichiers ne sont jamais exposés publiquement : ils sont lus par le
/// serveur, qui vérifie les droits avant de les transmettre.
export interface Stockage {
  deposer(chemin: string, contenu: Uint8Array, typeMime: string): Promise<void>;
  lire(chemin: string): Promise<Blob>;
  supprimer(chemins: string[]): Promise<void>;
}

export class StockageNonConfigure extends Error {
  constructor() {
    super(
      "Le stockage des documents n'est pas configuré : renseignez SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY dans .env.",
    );
  }
}

class StockageSupabase implements Stockage {
  private readonly client: StorageClient;
  private bucketVerifie = false;

  constructor(
    url: string,
    cle: string,
    private readonly bucket: string,
  ) {
    this.client = new StorageClient(`${url.replace(/\/$/, "")}/storage/v1`, {
      apikey: cle,
      Authorization: `Bearer ${cle}`,
    });
  }

  /// Crée l'espace à la première utilisation s'il n'existe pas, toujours en
  /// privé : aucun fichier n'est accessible par une adresse publique.
  private async assurerBucket() {
    if (this.bucketVerifie) return;
    const { data, error } = await this.client.getBucket(this.bucket);
    if (error || !data) {
      const creation = await this.client.createBucket(this.bucket, { public: false });
      if (creation.error && !/already exists/i.test(creation.error.message)) {
        throw new Error(`Création de l'espace de stockage impossible : ${creation.error.message}`);
      }
    } else if (data.public) {
      throw new Error(
        `L'espace de stockage « ${this.bucket} » est public. Il doit être privé : les documents contiennent des données personnelles.`,
      );
    }
    this.bucketVerifie = true;
  }

  async deposer(chemin: string, contenu: Uint8Array, typeMime: string) {
    await this.assurerBucket();
    const { error } = await this.client
      .from(this.bucket)
      .upload(chemin, contenu, { contentType: typeMime, upsert: false });
    if (error) throw new Error(`Dépôt du fichier impossible : ${error.message}`);
  }

  async lire(chemin: string) {
    await this.assurerBucket();
    const { data, error } = await this.client.from(this.bucket).download(chemin);
    if (error || !data) throw new Error(`Lecture du fichier impossible : ${error?.message ?? "fichier vide"}`);
    return data;
  }

  async supprimer(chemins: string[]) {
    if (chemins.length === 0) return;
    await this.assurerBucket();
    const { error } = await this.client.from(this.bucket).remove(chemins);
    if (error) throw new Error(`Suppression du fichier impossible : ${error.message}`);
  }
}

let instance: Stockage | undefined;

export function stockage(): Stockage {
  if (instance) return instance;
  const url = process.env.SUPABASE_URL;
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !cle) throw new StockageNonConfigure();
  instance = new StockageSupabase(url, cle, process.env.SUPABASE_STORAGE_BUCKET || "documents");
  return instance;
}

export function stockageConfigure(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/// Quota de l'offre gratuite Supabase. À ajuster si l'offre change.
export const QUOTA_STOCKAGE_OCTETS = 1024 * 1024 * 1024;
