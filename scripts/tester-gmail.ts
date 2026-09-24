import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";

// Vérifie que Formalogy OS peut se connecter au compte Gmail, sans envoyer
// ni lire quoi que ce soit. Deux connexions sont testées :
//   — SMTP, pour l'envoi des emails ;
//   — IMAP, pour la relève des documents signés BoldSign.
//
// Usage : npm run tester-gmail

const adresse = (process.env.GMAIL_ADRESSE ?? "").trim();
// Google affiche le mot de passe d'application en quatre groupes de quatre :
// les espaces recopiés par mégarde ne doivent pas faire échouer la connexion.
const motDePasse = (process.env.GMAIL_MOT_DE_PASSE_APPLI ?? "").replace(/\s+/g, "");

function echec(message: string, conseil?: string): never {
  console.error(`\n  ✗ ${message}`);
  if (conseil) console.error(`    ${conseil}`);
  process.exit(1);
}

async function testerEnvoi() {
  const transporteur = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: adresse, pass: motDePasse },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
  });
  // verify() authentifie puis raccroche : aucun message n'est envoyé.
  await transporteur.verify();
  transporteur.close();
}

async function testerReleve() {
  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: adresse, pass: motDePasse },
    logger: false,
  });
  await client.connect();
  // Ouverture en lecture seule, comme le fait la relève : rien n'est modifié.
  const verrou = await client.getMailboxLock("INBOX", { readOnly: true });
  verrou.release();
  await client.logout();
}

async function main() {
  console.log("\n  Test de connexion Gmail\n  ───────────────────────────────────────────");
  if (!adresse) echec("GMAIL_ADRESSE n'est pas renseignée dans le fichier .env.");
  if (!motDePasse) {
    echec(
      "GMAIL_MOT_DE_PASSE_APPLI n'est pas renseigné dans le fichier .env.",
      "Ce n'est pas le mot de passe du compte : il s'agit d'un mot de passe d'application, à créer dans la sécurité du compte Google, une fois la validation en deux étapes activée.",
    );
  }
  console.log(`  Compte        : ${adresse}`);
  console.log(`  Mot de passe  : ${motDePasse.length} caractères (attendu : 16)\n`);

  try {
    await testerEnvoi();
    console.log("  ✓ Envoi (SMTP) — connexion acceptée, aucun email envoyé");
  } catch (erreur) {
    const e = erreur as { code?: string; response?: string; message?: string };
    if (e.code === "EAUTH") {
      echec(
        "Gmail refuse la connexion pour l'envoi.",
        "Adresse ou mot de passe d'application incorrect. Vérifiez aussi que la validation en deux étapes est bien active sur le compte.",
      );
    }
    echec(`Connexion SMTP impossible : ${e.response ?? e.message ?? "motif inconnu"}`);
  }

  try {
    await testerReleve();
    console.log("  ✓ Relève (IMAP) — connexion acceptée, boîte ouverte en lecture seule");
  } catch (erreur) {
    const e = erreur as { authenticationFailed?: boolean; message?: string };
    if (e.authenticationFailed) {
      echec(
        "Gmail refuse la connexion pour la relève.",
        "Le même mot de passe d'application sert aux deux usages. Si l'envoi fonctionne mais pas la relève, vérifiez que l'accès IMAP est activé dans les paramètres Gmail.",
      );
    }
    echec(`Connexion IMAP impossible : ${e.message ?? "motif inconnu"}`);
  }

  console.log("\n  ───────────────────────────────────────────");
  console.log("  Tout fonctionne. Les envois restent simulés tant que");
  console.log("  EMAILS_ENVOI_REEL ne vaut pas exactement « true ».\n");
}

main();
