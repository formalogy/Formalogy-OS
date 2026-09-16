type Props = { nom: string; className?: string };

const CHEMINS: Record<string, React.ReactNode> = {
  jauge: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l2.5 2.5" />
    </>
  ),
  personnes: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M2.5 19c0-3.3 2.9-5.5 6.5-5.5s6.5 2.2 6.5 5.5" />
      <circle cx="17.5" cy="8.5" r="2.3" />
    </>
  ),
  livre: (
    <>
      <path d="M4 5.5C4 4.7 4.7 4 5.5 4H12v16H5.5A1.5 1.5 0 0 1 4 18.5v-13Z" />
      <path d="M20 5.5c0-.8-.7-1.5-1.5-1.5H12v16h6.5a1.5 1.5 0 0 0 1.5-1.5v-13Z" />
    </>
  ),
  document: (
    <>
      <path d="M6 3h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M9 12h6M9 16h6" />
    </>
  ),
  euro: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9.5c0-1.4 1.3-2.3 3-2.3s3 .9 3 2.1c0 2.6-6 1.2-6 4 0 1.3 1.3 2.2 3 2.2s3-.8 3-2.1" />
    </>
  ),
  etoile: (
    <path d="m12 2.5 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4-3.9-3.8 5.4-.8Z" />
  ),
  engrenage: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.4-2-3.4-2.3.8a7.5 7.5 0 0 0-2.6-1.5L14 2.5h-4l-.5 2.5a7.5 7.5 0 0 0-2.6 1.5l-2.3-.8-2 3.4 2 1.4a7.6 7.6 0 0 0 0 3l-2 1.4 2 3.4 2.3-.8c.8.6 1.7 1.1 2.6 1.5l.5 2.5h4l.5-2.5c.9-.4 1.8-.9 2.6-1.5l2.3.8 2-3.4-2-1.4Z" />
    </>
  ),
  recherche: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  boussole: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M14.5 9.5 12 12l-2.5 2.5L12 12l2.5-2.5Z" />
    </>
  ),
};

export function Icone({ nom, className = "size-4" }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {CHEMINS[nom] ?? null}
    </svg>
  );
}
