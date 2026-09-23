import { FormulaireOrganisme } from "@/app/(app)/parametres/organisme/formulaire";
import { SignatureOrganisme } from "@/app/(app)/parametres/organisme/signature";
import { lireOrganisme, manquesOrganisme } from "@/lib/organisme";
import { exigerRole } from "@/lib/session";
import { jourVersSaisie } from "@/lib/sessions-libelles";

export const dynamic = "force-dynamic";

export default async function PageOrganisme() {
  const utilisateur = await exigerRole("ADMIN", "GESTIONNAIRE");
  const o = await lireOrganisme();
  const manques = manquesOrganisme(o);

  const initiales = Object.fromEntries(
    Object.entries(o)
      .filter(([cle]) => cle !== "id" && cle !== "updatedAt")
      .map(([cle, valeur]) => [cle, valeur === null ? "" : valeur instanceof Date ? jourVersSaisie(valeur) : String(valeur)]),
  );

  return (
    <>
      <header className="mb-6">
        <h1 className="text-[22px] font-extrabold tracking-tight">Organisme</h1>
        <p className="mt-1 text-[12.8px] text-texte-doux">
          Informations légales reprises sur les attestations, certificats et emails.
        </p>
      </header>

      {manques.length > 0 && (
        <p className="mb-4 max-w-3xl rounded-lg bg-alerte/12 px-3 py-2 text-[12.5px] text-alerte">
          À compléter avant de générer des attestations : {manques.join(", ")}.
        </p>
      )}

      <FormulaireOrganisme initiales={initiales} lectureSeule={utilisateur.role !== "ADMIN"} />

      {/* Le dépôt d'une signature engage la société : réservé aux administrateurs. */}
      {utilisateur.role === "ADMIN" && (
        <div className="mt-4">
          <SignatureOrganisme presente={o.signatureCheminStockage !== null} />
        </div>
      )}
    </>
  );
}
