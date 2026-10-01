import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Saisie de la clé de l'API Anthropic (assistant IA), sans qu'elle
// apparaisse à l'écran ni dans l'historique du terminal. Elle est écrite dans
// le fichier .env, seul endroit où vivent les clés du projet, puis vérifiée
// (lecture de la fiche du modèle : aucune question posée, rien de facturé).
//
// Usage : npm run configurer-assistant

const CHEMIN_ENV = join(process.cwd(), ".env");
const CLE = "ANTHROPIC_API_KEY";

/// Lit une saisie sans l'afficher, caractère par caractère.
function demanderMasque(question: string): Promise<string> {
  return new Promise((resoudre, rejeter) => {
    if (!process.stdin.isTTY) {
      rejeter(new Error("Cette commande doit être lancée dans un terminal."));
      return;
    }
    process.stdout.write(question);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    let saisie = "";
    // Un collage arrive d'un bloc, parfois encadré par les marqueurs de
    // collage du terminal : on retire ces marqueurs et on traite le bloc
    // caractère par caractère (une étoile par caractère collé).
    const surBloc = (bloc: string) => {
      for (const touche of bloc.replace(/\u001b\[20[01]~/g, "")) {
        if (!process.stdin.listenerCount("data")) return;
        surTouche(touche);
      }
    };
    const surTouche = (touche: string) => {
      // Entrée : on valide. Ctrl+C : on abandonne. Retour arrière : on efface.
      if (touche === "\r" || touche === "\n") {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener("data", surBloc);
        process.stdout.write("\n");
        resoudre(saisie.trim());
      } else if (touche === "\u0003") {
        process.stdout.write("\n  Abandon.\n");
        process.exit(1);
      } else if (touche === "\u007f" || touche === "\b") {
        if (saisie.length > 0) {
          saisie = saisie.slice(0, -1);
          process.stdout.write("\b \b");
        }
      } else if (touche >= " ") {
        saisie += touche;
        // Une étoile par caractère : on voit qu'on tape, pas ce qu'on tape.
        process.stdout.write("*");
      }
    };
    process.stdin.on("data", surBloc);
  });
}

/// Remplace la valeur d'une clé dans le fichier .env, sans toucher au reste.
function ecrireDansEnv(cle: string, valeur: string) {
  const contenu = readFileSync(CHEMIN_ENV, "utf8");
  const lignes = contenu.split("\n");
  const index = lignes.findIndex((l) => l.startsWith(`${cle}=`));
  if (index === -1) lignes.push(`${cle}=${valeur}`);
  else lignes[index] = `${cle}=${valeur}`;
  writeFileSync(CHEMIN_ENV, lignes.join("\n"), { mode: 0o600 });
}

async function main() {
  console.log("\n  Clé de l'API Anthropic (assistant IA)");
  console.log("  ───────────────────────────────────────────");
  console.log("  Elle se crée sur console.anthropic.com → API Keys, et commence");
  console.log("  par « sk-ant- ». Elle ne s'affiche qu'une fois à sa création.");
  console.log("\n  Rien ne s'affichera pendant la saisie. Collez-la et validez.\n");

  const cle = (await demanderMasque("  Clé : ")).trim();
  if (!cle) {
    console.error("\n  ✗ Rien n'a été saisi : le fichier n'a pas été modifié.\n");
    process.exit(1);
  }
  if (!cle.startsWith("sk-ant-")) console.warn("\n  ⚠ La clé ne commence pas par « sk-ant- » : vérifiez-la.");

  ecrireDansEnv(CLE, cle);
  console.log("\n  ✓ Enregistrée dans .env. Ce fichier n'est pas suivi par git : rien ne partira sur GitHub.");

  console.log("\n  Vérification auprès d'Anthropic…");
  const modele = await new Anthropic({ apiKey: cle }).models.retrieve(process.env.ASSISTANT_MODELE || "claude-opus-5");
  console.log(`  ✓ Clé acceptée — modèle ${modele.display_name} disponible.`);
  console.log("    Redémarrez l'application (npm run dev) pour que l'assistant la prenne en compte.\n");
}

main().catch((erreur) => {
  const message = erreur instanceof Anthropic.AuthenticationError ? "Clé refusée par Anthropic : vérifiez-la." : erreur instanceof Error ? erreur.message : String(erreur);
  console.error(`\n  ✗ ${message}\n`);
  process.exit(1);
});
