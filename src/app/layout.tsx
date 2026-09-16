import type { Metadata } from "next";
import { IBM_Plex_Sans, Libre_Franklin } from "next/font/google";

import "./globals.css";

const libreFranklin = Libre_Franklin({
  variable: "--font-titre",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-texte",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Formalogy OS",
  description: "Centre de pilotage de l'organisme de formation Formalogy",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`${libreFranklin.variable} ${ibmPlexSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
