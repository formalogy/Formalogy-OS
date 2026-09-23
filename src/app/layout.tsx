import type { Metadata } from "next";
import { Outfit } from "next/font/google";

import "./globals.css";

// Une seule police pour tout le site (titres et texte) — choisie avec le
// client le 19/09/2026 pour son rendu plus moderne.
const outfit = Outfit({
  variable: "--font-outfit",
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
      className={`${outfit.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
