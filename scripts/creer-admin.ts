import { randomBytes } from "node:crypto";

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

import { prisma } from "../src/lib/prisma.ts";

// Crée un compte utilisateur interne.
//
// L'application n'expose aucune inscription publique : ce script est le seul
// moyen de créer le tout premier compte. Les suivants seront créés depuis les
// Paramètres, par un administrateur.
//
// Usage : npm run creer-admin -- <email> "<Prénom Nom>" [ADMIN|GESTIONNAIRE|FORMATEUR]

const ROLES = ["ADMIN", "GESTIONNAIRE", "FORMATEUR"] as const;
type RoleValide = (typeof ROLES)[number];

function motDePasseAleatoire(): string {
  // 24 caractères en base64url : assez long pour être sûr, sans caractère
  // ambigu à recopier.
  return randomBytes(18).toString("base64url");
}

async function main() {
  const [email, nom, roleDemande = "ADMIN"] = process.argv.slice(2);

  if (!email || !nom) {
    console.error('Usage : npm run creer-admin -- <email> "<Prénom Nom>" [rôle]');
    process.exit(1);
  }

  if (!ROLES.includes(roleDemande as RoleValide)) {
    console.error(`Rôle invalide : ${roleDemande}. Valeurs possibles : ${ROLES.join(", ")}`);
    process.exit(1);
  }
  const role = roleDemande as RoleValide;

  const existant = await prisma.user.findUnique({ where: { email } });
  if (existant) {
    console.error(`Un compte existe déjà pour ${email}.`);
    process.exit(1);
  }

  const motDePasse = motDePasseAleatoire();

  // L'application désactive l'inscription. On utilise ici une instance
  // dédiée qui l'autorise, pour que le mot de passe soit haché exactement
  // comme le fera la connexion.
  const authAmorcage = betterAuth({
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    emailAndPassword: { enabled: true, minPasswordLength: 12 },
  });

  await authAmorcage.api.signUpEmail({
    body: { email, password: motDePasse, name: nom },
  });

  const utilisateur = await prisma.user.update({
    where: { email },
    data: { role, emailVerified: true },
  });

  await prisma.activity.create({
    data: {
      action: "user.created",
      summary: `Compte ${role} créé pour ${nom} (${email})`,
      entityType: "User",
      entityId: utilisateur.id,
      userId: utilisateur.id,
    },
  });

  console.log("");
  console.log("  Compte créé");
  console.log("  ───────────────────────────────────────────");
  console.log(`  Email         : ${email}`);
  console.log(`  Rôle          : ${role}`);
  console.log(`  Mot de passe  : ${motDePasse}`);
  console.log("  ───────────────────────────────────────────");
  console.log("  Note ce mot de passe : il ne sera plus jamais affiché.");
  console.log("");
}

main()
  .catch((erreur) => {
    console.error("Échec de la création du compte :", erreur);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
