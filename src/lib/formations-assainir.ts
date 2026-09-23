import "server-only";

import sanitizeHtml from "sanitize-html";

import { estHtmlFormation } from "@/lib/formations-texte";

/// Nettoie le HTML produit par l'éditeur avant enregistrement : seules les
/// balises de mise en forme qu'il peut produire passent, et seul le style
/// « font-family » est gardé sur un <span> (évite d'enregistrer n'importe
/// quel CSS collé depuis une autre page).
export function assainirTexteFormation(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ["p", "br", "strong", "em", "u", "span"],
    allowedAttributes: { span: ["style"] },
    allowedStyles: { span: { "font-family": [/^[- '",\w]+$/] } },
  }).trim();
}

/// Réduit un champ (HTML ou texte brut d'avant l'éditeur) à du texte simple à
/// sauts de ligne, pour les usages qui ne savent pas afficher du HTML (PDF).
export function texteFormationVersBrut(valeur: string): string {
  if (!estHtmlFormation(valeur)) return valeur;
  const avecSauts = valeur.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n");
  return sanitizeHtml(avecSauts, { allowedTags: [], allowedAttributes: {} })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
