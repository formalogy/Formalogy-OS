@AGENTS.md

# Formalogy OS

Logiciel de gestion interne d'un organisme de formation français (Formalogy) :
CRM, apprenants, sessions, documents, signatures, facturation, Qualiopi.

## Nature du produit

Outil **interne**, utilisé par 3 à 5 personnes (le dirigeant, un gestionnaire,
puis des formateurs). Ce n'est **pas** un SaaS multi-clients.

- **Mono-organisme** : pas d'identifiant d'organisation sur les tables.
- **Aucun compte apprenant** : les apprenants sont des fiches en base, jamais
  des utilisateurs authentifiés. Ils signent depuis le portail Yousign et
  reçoivent des emails, rien de plus.
- **Rôles simples** portés par l'utilisateur : `ADMIN`, `GESTIONNAIRE`,
  `FORMATEUR`. Pas de table de permissions fines.
- Les écrans réservés aux formateurs vivent dans **la même application**,
  filtrés par rôle — pas d'extranet séparé.

## Stack

| Brique | Choix |
|---|---|
| Front + back | Next.js 16 (App Router, TypeScript, Tailwind 4) |
| Base de données | PostgreSQL via Supabase |
| Accès base | Prisma 7.10.0 (versions figées, pas de RC) |
| Authentification | Auth.js — **jamais** Supabase Auth |
| Stockage documents | Supabase Storage, derrière une abstraction |
| Emails | Resend |
| Signature électronique | Yousign (API + webhook + réconciliation) |
| Facturation externe | Henrri, derrière une interface (mock tant que l'API n'est pas fournie) |
| Automatisations | Inngest |
| Hébergement | À trancher (Phase 18) |

## Règle impérative : Supabase est de l'infrastructure brute

Supabase fournit **une base PostgreSQL et un espace de fichiers**, accessibles
**uniquement depuis notre serveur**. Interdits :

- ❌ Supabase Auth (on utilise Auth.js)
- ❌ Row Level Security (les droits sont vérifiés dans notre code serveur)
- ❌ SDK Supabase côté navigateur

Le client a explicitement rejeté l'ancien modèle où Supabase gérait tout côté
client. Respecter cette règle garantit que la base reste du PostgreSQL standard
et que le projet peut migrer ailleurs en quelques heures.

## Sécurité

- Les permissions sont vérifiées **côté serveur** à chaque requête. Le frontend
  ne fait jamais autorité.
- Les secrets (clé `service_role` Supabase, clés API) restent côté serveur.
- Trois catégories de routes, protégées différemment :
  1. l'application — session authentifiée + rôle
  2. le webhook Yousign — vérification de signature cryptographique
  3. les éventuels liens à usage unique — jeton signé, expirant
- Données personnelles d'apprenants en base : obligations RGPD entières, même
  sans compte apprenant. Prévoir export et suppression côté administrateur.

## Méthode de travail

Développement **phase par phase** (18 phases). Priorités, dans cet ordre :
simplicité → fiabilité → sécurité → évolutivité → automatisation.

Le client n'est pas développeur : expliquer simplement, éviter le jargon,
trancher soi-même les points mineurs, ne solliciter une validation que pour les
décisions structurantes (architecture globale, budget).

## Commandes

```bash
npm run dev     # démarre en local sur http://localhost:3000
npm run build   # vérifie que le projet compile
npm run lint    # analyse du code
```

Node.js est installé dans `~/.local/node` (ajouté au PATH via `~/.zshrc`).
