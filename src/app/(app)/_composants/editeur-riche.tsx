"use client";

import { useReducer } from "react";

import { FontFamily } from "@tiptap/extension-font-family";
import { TextStyle } from "@tiptap/extension-text-style";
import { EditorContent, useEditor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";

import { texteFormationVersHtml } from "@/lib/formations-texte";

const POLICES = [
  { valeur: "", libelle: "Police par défaut" },
  { valeur: "Arial, sans-serif", libelle: "Arial" },
  { valeur: "Georgia, serif", libelle: "Georgia" },
  { valeur: "'Times New Roman', serif", libelle: "Times New Roman" },
  { valeur: "'Courier New', monospace", libelle: "Courier New" },
  { valeur: "Verdana, sans-serif", libelle: "Verdana" },
];

const CLASSE_BOUTON = "flex size-7 items-center justify-center rounded text-[13px] text-texte-doux hover:bg-surface";
const CLASSE_BOUTON_ACTIF = "flex size-7 items-center justify-center rounded bg-accent text-[13px] text-white";

type Props = {
  nom: string;
  libelle: string;
  valeurParDefaut?: string;
};

/// Champ de texte enrichi (gras, italique, souligné, police) pour les
/// sections longues d'une formation. Garde un <input type="hidden"> à jour
/// avec le HTML courant, sous le même nom que l'ancien <textarea> : le
/// formulaire et les actions serveur n'ont rien à changer.
export function EditeurRiche({ nom, libelle, valeurParDefaut }: Props) {
  // Depuis TipTap 3, l'éditeur ne redéclenche plus de rendu React à chaque
  // frappe par défaut : sans ça, le champ caché (et l'état actif des boutons)
  // resteraient figés sur le contenu initial.
  const [, forcerRendu] = useReducer((x: number) => x + 1, 0);

  const editor = useEditor({
    immediatelyRender: false,
    onUpdate: forcerRendu,
    onSelectionUpdate: forcerRendu,
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        codeBlock: false,
        code: false,
        horizontalRule: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        listKeymap: false,
        link: false,
        strike: false,
      }),
      TextStyle,
      FontFamily,
    ],
    content: valeurParDefaut ? texteFormationVersHtml(valeurParDefaut) : "",
    editorProps: {
      attributes: {
        class:
          "min-h-24 rounded-b-lg border border-t-0 border-bordure bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent [&_p]:my-1",
      },
    },
  });

  return (
    <div>
      <label className="block text-[12.5px] font-semibold">
        {libelle} <span className="font-normal text-texte-tenu">(facultatif)</span>
      </label>

      {!editor ? (
        <div className="mt-1.5 h-32 animate-pulse rounded-lg border border-bordure bg-surface-creuse" />
      ) : (
        <div className="mt-1.5">
          <div className="flex flex-wrap items-center gap-1 rounded-t-lg border border-bordure bg-surface-creuse px-2 py-1.5">
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleBold().run()}
              aria-pressed={editor.isActive("bold")}
              aria-label="Gras"
              className={editor.isActive("bold") ? `${CLASSE_BOUTON_ACTIF} font-bold` : `${CLASSE_BOUTON} font-bold`}
            >
              G
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleItalic().run()}
              aria-pressed={editor.isActive("italic")}
              aria-label="Italique"
              className={editor.isActive("italic") ? `${CLASSE_BOUTON_ACTIF} italic` : `${CLASSE_BOUTON} italic`}
            >
              I
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleUnderline().run()}
              aria-pressed={editor.isActive("underline")}
              aria-label="Souligné"
              className={editor.isActive("underline") ? `${CLASSE_BOUTON_ACTIF} underline` : `${CLASSE_BOUTON} underline`}
            >
              S
            </button>
            <select
              aria-label="Police d'écriture"
              defaultValue=""
              onChange={(e) => {
                const valeur = e.target.value;
                if (valeur) editor.chain().focus().setFontFamily(valeur).run();
                else editor.chain().focus().unsetFontFamily().run();
              }}
              className="ml-1 rounded border border-bordure bg-surface px-2 py-1 text-[12px] outline-none focus:border-accent"
            >
              {POLICES.map((p) => (
                <option key={p.valeur} value={p.valeur}>
                  {p.libelle}
                </option>
              ))}
            </select>
          </div>
          <EditorContent editor={editor} />
        </div>
      )}

      <input type="hidden" name={nom} value={editor?.getHTML() ?? valeurParDefaut ?? ""} />
    </div>
  );
}
