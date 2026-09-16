/// Rappelle en permanence si les emails partent réellement ou sont simulés.
export function BandeauModeEnvoi({ reel }: { reel: boolean }) {
  return reel ? (
    <p className="mb-4 rounded-lg bg-succes/12 px-3 py-2 text-[12.5px] text-succes">
      Envoi réel activé : les emails partent vers leurs destinataires.
    </p>
  ) : (
    <p className="mb-4 rounded-lg bg-alerte/12 px-3 py-2 text-[12.5px] text-alerte">
      Mode simulation : aucun email ne quitte l&apos;application. Les envois sont enregistrés dans
      l&apos;historique avec le statut « Simulé ».
    </p>
  );
}
