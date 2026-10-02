import { ActionsWebhook, FormulaireWebhook } from "@/app/(app)/parametres/connexions/composants";
import { renvoyerEnvoi } from "@/app/(app)/parametres/connexions/actions";
import { prisma } from "@/lib/prisma";
import { exigerRole } from "@/lib/session";
import { EVENEMENTS_WEBHOOK } from "@/lib/webhooks";

export const dynamic = "force-dynamic";

const quand = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" });

/// Connexions externes : événements envoyés à Make (par exemple pour remplir
/// un tableur Excel). Envoi seulement, rien n'entre par ce chemin.
export default async function PageConnexions() {
  await exigerRole("ADMIN");
  const webhooks = await prisma.webhook.findMany({
    orderBy: { createdAt: "asc" },
    include: { envois: { orderBy: { createdAt: "desc" }, take: 10 } },
  });
  const libelle = (code: string) => EVENEMENTS_WEBHOOK[code as keyof typeof EVENEMENTS_WEBHOOK] ?? code;

  return (
    <>
      <header className="mb-6">
        <h1 className="text-[22px] font-extrabold tracking-tight">Connexions externes</h1>
        <p className="mt-1 max-w-2xl text-[12.8px] text-texte-doux">
          À chaque événement choisi, l&apos;application envoie une ligne de données à un scénario Make, qui peut
          l&apos;ajouter dans un tableur Excel (ou ailleurs). Chaque événement part une seule fois. Les données des
          stagiaires (nom, email, téléphone) quittent alors l&apos;application : Make est à déclarer au registre RGPD.
        </p>
      </header>

      <section className="mb-4 max-w-3xl rounded-xl border border-bordure bg-surface p-5 shadow-sm">
        <h2 className="mb-1 text-[14.5px] font-bold">Comment faire, côté Make</h2>
        <ol className="list-decimal space-y-1 pl-5 text-[12.5px] text-texte-doux">
          <li>Dans Make, créez un scénario qui commence par « Webhooks → Custom webhook », et copiez son adresse.</li>
          <li>Ajoutez la connexion ci-dessous avec cette adresse, puis cliquez sur « Envoyer une ligne d&apos;essai » : Make découvre les colonnes.</li>
          <li>Dans Make, ajoutez le module « Microsoft 365 Excel → Add a row » et associez chaque colonne.</li>
        </ol>
      </section>

      <div className="flex max-w-3xl flex-col gap-4">
        {webhooks.map((w) => (
          <section key={w.id} className="rounded-xl border border-bordure bg-surface p-5 shadow-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-[14.5px] font-bold">{w.nom}</h2>
              <span className={`text-[12px] font-semibold ${w.actif ? "text-succes" : "text-texte-tenu"}`}>{w.actif ? "Active" : "Désactivée"}</span>
            </div>
            <p className="mt-0.5 truncate font-mono text-[11.5px] text-texte-tenu">{w.url.replace(/^(https:\/\/[^/]+\/).{6,}(.{4})$/, "$1…$2")}</p>
            <p className="mt-1 text-[12.5px]">Événements : {w.evenements.map(libelle).join(", ")}</p>
            <div className="mt-3">
              <ActionsWebhook id={w.id} actif={w.actif} />
            </div>
            {w.envois.length > 0 && (
              <ul className="mt-4 divide-y divide-bordure-douce border-t border-bordure-douce text-[12px]">
                {w.envois.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
                    <span className="text-texte-tenu">{quand.format(e.createdAt)}</span>
                    <span className="font-semibold">{libelle(e.evenement)}</span>
                    <span className="min-w-0 flex-1 truncate">{e.resume}</span>
                    {e.ok ? (
                      <span className="font-semibold text-succes">Envoyé</span>
                    ) : (
                      <form action={renvoyerEnvoi} className="flex items-center gap-2">
                        <input type="hidden" name="id" value={e.id} />
                        <span className="text-danger">{e.erreur ?? "Échec"}</span>
                        <button className="font-semibold text-accent-fort underline">Renvoyer</button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}

        <section className="rounded-xl border border-bordure bg-surface p-5 shadow-sm">
          <h2 className="mb-3 text-[14.5px] font-bold">Nouvelle connexion</h2>
          <FormulaireWebhook evenements={Object.entries(EVENEMENTS_WEBHOOK)} />
        </section>
      </div>
    </>
  );
}
