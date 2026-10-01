"use client";

import { IconCheck, IconLoader2, IconSend, IconSparkles, IconX } from "@tabler/icons-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { executerProposition } from "@/app/(app)/_composants/assistant-actions";
import type { PropositionAffichee } from "@/lib/assistant/propositions";

type EtatProposition = "attente" | "encours" | "validee" | "ecartee" | "erreur";
type PropositionSuivie = PropositionAffichee & { etat: EtatProposition; retour?: string; lien?: string };
type Entree = { role: "user" | "assistant"; content: string; propositions?: PropositionSuivie[] };

const CLE_STOCKAGE = "formalogy-assistant";
const EXEMPLES = [
  "Qui commence une formation la semaine prochaine ?",
  "Qu'est-ce qui bloque en ce moment ?",
  "Quels paiements sont attendus d'ici la fin du mois ?",
];
const LIBELLE_ETAT: Partial<Record<EtatProposition, string>> = { validee: "validée et faite", ecartee: "écartée", erreur: "échouée", attente: "en attente de validation" };

/// Ce que Claude relit de la conversation : les textes, et le sort de
/// chaque proposition (validée, écartée…), pour qu'il sache où on en est.
function historique(entrees: Entree[]) {
  return entrees.map((e) => ({
    role: e.role,
    content: [e.content, ...(e.propositions ?? []).map((p) => `[Proposition « ${p.titre} » : ${LIBELLE_ETAT[p.etat] ?? p.etat}${p.retour ? ` — ${p.retour}` : ""}]`)].join("\n"),
  }));
}

/// Assistant IA (Phase 5) : une fenêtre de discussion ouverte depuis le coin
/// de l'écran, qui reste ouverte d'une page à l'autre. Il répond aux
/// questions et prépare des actions ; rien ne se fait sans « Valider ».
export function Assistant() {
  const [ouvert, setOuvert] = useState(false);
  const [entrees, setEntrees] = useState<Entree[]>([]);
  const [saisie, setSaisie] = useState("");
  const [attente, setAttente] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const fil = useRef<HTMLDivElement>(null);

  // La conversation survit au rechargement de l'onglet (pas au-delà).
  useEffect(() => {
    try {
      const sauvee = sessionStorage.getItem(CLE_STOCKAGE);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (sauvee) setEntrees(JSON.parse(sauvee));
    } catch {}
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem(CLE_STOCKAGE, JSON.stringify(entrees));
    } catch {}
    fil.current?.scrollTo({ top: fil.current.scrollHeight, behavior: "smooth" });
  }, [entrees, attente]);

  async function envoyer(texte: string) {
    const question = texte.trim();
    if (!question || attente) return;
    const suite: Entree[] = [...entrees, { role: "user", content: question }];
    setEntrees(suite);
    setSaisie("");
    setErreur(null);
    setAttente(true);
    try {
      const r = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: historique(suite).slice(-40) }),
      });
      const donnees = await r.json().catch(() => ({ erreur: "Réponse illisible du serveur." }));
      if (!r.ok || donnees.erreur) {
        setErreur(donnees.erreur ?? "L'assistant ne répond pas.");
        setEntrees(entrees);
        setSaisie(question);
        return;
      }
      setEntrees([
        ...suite,
        {
          role: "assistant",
          content: donnees.texte,
          propositions: (donnees.propositions as PropositionAffichee[]).map((p) => ({ ...p, etat: "attente" as const })),
        },
      ]);
    } catch {
      setErreur("Connexion impossible avec le serveur.");
      setEntrees(entrees);
      setSaisie(question);
    } finally {
      setAttente(false);
    }
  }

  function majProposition(id: string, maj: Partial<PropositionSuivie>) {
    setEntrees((liste) =>
      liste.map((e) => (e.propositions?.some((p) => p.id === id) ? { ...e, propositions: e.propositions.map((p) => (p.id === id ? { ...p, ...maj } : p)) } : e)),
    );
  }

  async function valider(p: PropositionSuivie) {
    majProposition(p.id, { etat: "encours" });
    try {
      const r = await executerProposition(p.proposition);
      majProposition(p.id, r.erreur ? { etat: "erreur", retour: r.erreur, lien: r.lien } : { etat: "validee", retour: r.succes, lien: r.lien });
    } catch {
      majProposition(p.id, { etat: "erreur", retour: "L'action n'a pas pu être exécutée." });
    }
  }

  return (
    <>
      {!ouvert && (
        <button
          type="button"
          onClick={() => setOuvert(true)}
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-barre-logo px-4 py-3 text-[13px] font-semibold text-white shadow-lg transition hover:brightness-110"
        >
          <IconSparkles className="size-5" stroke={1.75} aria-hidden="true" />
          Assistant
        </button>
      )}

      {ouvert && (
        <section
          aria-label="Assistant IA"
          className="fixed inset-0 z-50 flex flex-col bg-surface shadow-2xl sm:inset-auto sm:bottom-5 sm:right-5 sm:h-[min(42rem,calc(100vh-2.5rem))] sm:w-[26rem] sm:rounded-2xl sm:ring-1 sm:ring-bordure"
        >
          <header className="flex shrink-0 items-center gap-2.5 rounded-t-2xl bg-barre px-4 py-3 text-white">
            <IconSparkles className="size-5 text-barre-logo" stroke={1.75} aria-hidden="true" />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="text-[14px] font-semibold">Assistant</div>
              <div className="text-[11px] text-white/70">Il propose, vous validez</div>
            </div>
            {entrees.length > 0 && (
              <button type="button" onClick={() => { setEntrees([]); setErreur(null); }} className="rounded-full px-2.5 py-1 text-[11.5px] text-white/80 hover:bg-white/10 hover:text-white">
                Nouvelle conversation
              </button>
            )}
            <button type="button" aria-label="Fermer l'assistant" onClick={() => setOuvert(false)} className="flex size-8 items-center justify-center rounded-full hover:bg-white/10">
              <IconX className="size-4" stroke={2} aria-hidden="true" />
            </button>
          </header>

          <div ref={fil} className="flex-1 space-y-3 overflow-y-auto px-4 py-4 text-[13px]">
            {entrees.length === 0 && (
              <div className="space-y-3 text-texte-doux">
                <p>Posez une question sur vos apprenants, sessions, factures… ou demandez-moi de préparer une action (créer un apprenant, l&apos;inscrire, signaler une absence). Rien ne se fait sans votre validation.</p>
                <div className="space-y-1.5">
                  {EXEMPLES.map((e) => (
                    <button key={e} type="button" onClick={() => envoyer(e)} className="block w-full rounded-xl border border-bordure px-3 py-2 text-left text-texte hover:bg-surface-creuse">
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {entrees.map((e, i) =>
              e.role === "user" ? (
                <div key={i} className="ml-8 whitespace-pre-wrap rounded-2xl rounded-br-md bg-barre px-3.5 py-2.5 text-white">
                  {e.content}
                </div>
              ) : (
                <div key={i} className="mr-4 space-y-2">
                  <div className="whitespace-pre-wrap rounded-2xl rounded-bl-md bg-surface-creuse px-3.5 py-2.5 text-texte">{e.content.replace(/\*\*/g, "")}</div>
                  {e.propositions?.map((p) => (
                    <div key={p.id} className="rounded-2xl border border-bordure bg-surface p-3">
                      <div className="text-[12.5px] font-semibold">{p.titre}</div>
                      <ul className="mt-1 space-y-0.5 text-[12.5px] text-texte-doux">
                        {p.lignes.map((l, j) => (
                          <li key={j}>{l}</li>
                        ))}
                      </ul>
                      {p.etat === "attente" || p.etat === "encours" ? (
                        <div className="mt-2.5 flex gap-2">
                          <button
                            type="button"
                            disabled={p.etat === "encours"}
                            onClick={() => valider(p)}
                            className="flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:bg-accent-fort disabled:opacity-60"
                          >
                            {p.etat === "encours" ? <IconLoader2 className="size-4 animate-spin" aria-hidden="true" /> : <IconCheck className="size-4" aria-hidden="true" />}
                            Valider
                          </button>
                          <button
                            type="button"
                            disabled={p.etat === "encours"}
                            onClick={() => majProposition(p.id, { etat: "ecartee" })}
                            className="rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold text-texte-doux hover:bg-surface-creuse disabled:opacity-60"
                          >
                            Écarter
                          </button>
                        </div>
                      ) : (
                        <div className={`mt-2 text-[12px] font-semibold ${p.etat === "validee" ? "text-succes" : p.etat === "erreur" ? "text-danger" : "text-texte-tenu"}`}>
                          {p.etat === "ecartee" ? "Écartée" : p.retour}
                          {p.lien && (
                            <>
                              {" "}
                              <Link href={p.lien} className="text-accent-fort underline">
                                Ouvrir la fiche
                              </Link>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ),
            )}

            {attente && (
              <div className="flex items-center gap-2 text-texte-tenu">
                <IconLoader2 className="size-4 animate-spin" aria-hidden="true" />
                Je regarde…
              </div>
            )}
            {erreur && <div className="rounded-xl bg-danger-pale px-3 py-2 text-danger">{erreur}</div>}
          </div>

          <form
            onSubmit={(ev) => {
              ev.preventDefault();
              envoyer(saisie);
            }}
            className="flex shrink-0 items-end gap-2 border-t border-bordure-douce p-3"
          >
            <textarea
              value={saisie}
              onChange={(ev) => setSaisie(ev.target.value)}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" && !ev.shiftKey) {
                  ev.preventDefault();
                  envoyer(saisie);
                }
              }}
              rows={2}
              placeholder="Votre question ou votre demande…"
              aria-label="Message à l'assistant"
              className="min-h-[2.75rem] flex-1 resize-none rounded-xl border border-bordure bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent"
            />
            <button
              type="submit"
              disabled={attente || !saisie.trim()}
              aria-label="Envoyer"
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-barre-logo text-white disabled:opacity-50"
            >
              <IconSend className="size-4" stroke={2} aria-hidden="true" />
            </button>
          </form>
        </section>
      )}
    </>
  );
}
