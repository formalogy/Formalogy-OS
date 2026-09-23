import "server-only";

import { createHash } from "node:crypto";

/// Photo associée au compte email d'une personne, via Gravatar (service
/// public : hash de l'email → image, sans authentification). Utilisé comme
/// avatar automatique quand personne n'a déposé de photo à la main.
/// Ne renvoie rien si le délai dépasse 3 s ou si l'email n'a pas de Gravatar
/// (`d=404` : pas d'image générique par défaut, pour pouvoir basculer sur les
/// initiales).
export async function recupererGravatar(email: string): Promise<{ octets: Uint8Array; typeMime: string } | null> {
  const hash = createHash("md5").update(email.trim().toLowerCase()).digest("hex");
  try {
    const reponse = await fetch(`https://www.gravatar.com/avatar/${hash}?s=160&d=404`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!reponse.ok) return null;
    return {
      octets: new Uint8Array(await reponse.arrayBuffer()),
      typeMime: reponse.headers.get("content-type") ?? "image/jpeg",
    };
  } catch {
    return null;
  }
}
