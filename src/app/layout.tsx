import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";

import "./globals.css";

// Une seule police pour tout le site (titres et texte) — choisie avec le
// client le 19/09/2026 pour son rendu plus moderne.
const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

// Chiffres des cartes du tableau de bord (choix du client, 01/10/2026).
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["700"],
});

export const metadata: Metadata = {
  title: "Formalogy OS",
  description: "Centre de pilotage de l'organisme de formation Formalogy",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`${outfit.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
