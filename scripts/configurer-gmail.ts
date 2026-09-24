import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Saisie du mot de passe d'application Gmail, sans qu'il apparaisse à
// l'écran ni dans l'historique du terminal. Il est écrit dans le fichier
// .env, seul endroit où vivent les clés du projet.
//
// Usage : npm run configurer-gmail

const CHEMIN_ENV = join(process.cwd(), ".env");
const CLE = "GMAIL_MOT_DE_PASSE_APPLI";

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
    const surTouche = (touche: string) => {
      // Entrée : on valide. Ctrl+C : on abandonne. Retour arrière : on efface.
      if (touche === "\r" || touche === "\n") {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener("data", surTouche);
        process.stdout.write("\n");
        resoudre(saisie);
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
    process.stdin.on("data", surTouche);
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
  console.log("\n  Mot de passe d'application Gmail");
  console.log("  ───────────────────────────────────────────");
  console.log("  Ce n'est pas le mot de passe de votre compte Google.");
  console.log("  C'est un mot de passe d'application, 16 caractères, créé dans");
  console.log("  la sécurité du compte — visible seulement si la validation en");
  console.log("  deux étapes est déjà activée.");
  console.log("\n  Rien ne s'affichera pendant la saisie. Collez-le et validez.\n");

  const saisie = await demanderMasque("  Mot de passe : ");
  // Google l'affiche en quatre groupes de quatre : les espaces sont retirés.
  const motDePasse = saisie.replace(/\s+/g, "");

  if (motDePasse.length === 0) {
    console.error("\n  ✗ Rien n'a été saisi : le fichier n'a pas été modifié.\n");
    process.exit(1);
  }
  if (motDePasse.length !== 16) {
    console.warn(`\n  ⚠ ${motDePasse.length} caractères au lieu de 16 attendus.`);
    console.warn("    C'est peut-être le mot de passe du compte plutôt qu'un mot de passe");
    console.warn("    d'application. Le test ci-dessous le dira.\n");
  }

  ecrireDansEnv(CLE, motDePasse);
  console.log(`\n  ✓ Enregistré dans .env (${motDePasse.length} caractères).`);
  console.log("    Ce fichier n'est pas suivi par git : rien ne partira sur GitHub.\n");

  console.log("  Vérification de la connexion…");
  const test = spawnSync("node", ["--env-file=.env", "scripts/tester-gmail.ts"], { stdio: "inherit" });
  process.exit(test.status ?? 0);
}

main().catch((erreur) => {
  console.error(`\n  ✗ ${erreur instanceof Error ? erreur.message : erreur}\n`);
  process.exit(1);
});
