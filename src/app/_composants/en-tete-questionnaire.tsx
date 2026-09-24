/// En-tête d'un questionnaire en ligne : titre, formation concernée, puis
/// salutation et introduction. Commun aux pages publiques et à l'aperçu.
export function EnTeteQuestionnaire({
  titre,
  contexte,
  prenom,
  introduction,
}: {
  titre: string;
  contexte?: string;
  prenom?: string;
  introduction?: string;
}) {
  return (
    <header className="mb-5">
      <h1 className="text-[22px] font-extrabold tracking-tight">{titre}</h1>
      {contexte && <p className="mt-1 text-[13.5px] font-semibold text-texte-doux">{contexte}</p>}
      {prenom && <p className="mt-3 text-[14px] text-texte-doux">Bonjour {prenom},</p>}
      {introduction && <p className={`whitespace-pre-line text-[14px] text-texte-doux ${prenom ? "mt-1" : "mt-3"}`}>{introduction}</p>}
    </header>
  );
}
