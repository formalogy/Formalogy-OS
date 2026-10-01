import "server-only";

import { prisma } from "@/lib/prisma";

/// Lecture de la base par l'assistant IA : des requêtes SELECT seulement,
/// exécutées dans une transaction en lecture seule (PostgreSQL refuse alors
/// toute écriture, quoi que contienne la requête), avec un délai maximal et
/// un nombre de lignes plafonné.
///
/// Tables écartées : comptes, mots de passe et connexions (better-auth), et
/// jetons des liens d'émargement — rien que l'assistant ait à lire.
const TABLES_INTERDITES = new Set(["user", "account", "session", "verification", "liens_emargement"]);
/// Mots qui n'ont rien à faire dans une simple lecture (fonctions système,
/// accès aux fichiers du serveur, modification de réglages).
const MOTS_INTERDITS = new Set(["pg_read_file", "pg_read_binary_file", "pg_ls_dir", "dblink", "copy", "set_config", "lo_import", "lo_export", "pg_sleep"]);

const LIGNES_MAX = 200;
const CARACTERES_MAX = 30_000;

export class RequeteRefusee extends Error {}

function controler(sql: string): string {
  const texte = sql.trim().replace(/;\s*$/, "");
  if (!/^(select|with)\b/i.test(texte)) throw new RequeteRefusee("Seules les requêtes SELECT (ou WITH … SELECT) sont permises.");
  if (texte.includes(";")) throw new RequeteRefusee("Une seule requête à la fois.");
  for (const mot of texte.toLowerCase().match(/[a-z_][a-z0-9_]*/g) ?? []) {
    if (TABLES_INTERDITES.has(mot)) throw new RequeteRefusee(`La table « ${mot} » n'est pas accessible (comptes et connexions). Les sessions de formation sont dans la table "sessions".`);
    if (MOTS_INTERDITS.has(mot) || mot.startsWith("pg_")) throw new RequeteRefusee(`« ${mot} » n'est pas permis.`);
  }
  return texte;
}

/// Valeurs lisibles en JSON : grands entiers, montants décimaux, dates.
function enJson(valeur: unknown): string {
  return JSON.stringify(valeur, (_cle, v) => {
    if (typeof v === "bigint") return Number(v);
    if (v && typeof v === "object" && "toFixed" in v && typeof (v as { toString: unknown }).toString === "function" && !(v instanceof Date)) {
      return (v as { toString(): string }).toString();
    }
    return v;
  });
}

export async function lireBase(sql: string): Promise<string> {
  const requete = controler(sql);
  const lignes = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '8s'");
    return tx.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT * FROM (${requete}) AS r LIMIT ${LIGNES_MAX + 1}`);
  });
  const coupe = lignes.length > LIGNES_MAX;
  let json = enJson(lignes.slice(0, LIGNES_MAX));
  if (json.length > CARACTERES_MAX) json = `${json.slice(0, CARACTERES_MAX)}… [tronqué]`;
  return `${Math.min(lignes.length, LIGNES_MAX)} ligne(s)${coupe ? ` (limite de ${LIGNES_MAX} atteinte, affinez la requête)` : ""}\n${json}`;
}

let schemaEnCache: string | null = null;

/// Plan de la base (tables, colonnes et valeurs possibles des énumérations),
/// lu dans PostgreSQL lui-même : il suit les migrations sans rien maintenir.
export async function planDeLaBase(): Promise<string> {
  if (schemaEnCache) return schemaEnCache;
  const colonnes = await prisma.$queryRawUnsafe<{ table_name: string; column_name: string; type: string }[]>(`
    SELECT c.table_name, c.column_name,
           CASE WHEN c.data_type = 'USER-DEFINED' THEN c.udt_name ELSE c.data_type END AS type
    FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name NOT LIKE '\\_prisma%'
    ORDER BY c.table_name, c.ordinal_position`);
  const enums = await prisma.$queryRawUnsafe<{ nom: string; valeurs: string }[]>(`
    SELECT t.typname AS nom, string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) AS valeurs
    FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace AND n.nspname = 'public'
    GROUP BY t.typname ORDER BY t.typname`);

  const tables = new Map<string, string[]>();
  for (const c of colonnes) {
    if (TABLES_INTERDITES.has(c.table_name)) continue;
    tables.set(c.table_name, [...(tables.get(c.table_name) ?? []), `"${c.column_name}" ${c.type}`]);
  }
  schemaEnCache = [
    "TABLES",
    ...[...tables].map(([t, cols]) => `${t}(${cols.join(", ")})`),
    "",
    "ÉNUMÉRATIONS",
    ...enums.map((e) => `${e.nom}: ${e.valeurs}`),
  ].join("\n");
  return schemaEnCache;
}
