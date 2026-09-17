@AGENTS.md

# Formalogy OS

Logiciel de gestion interne d'un organisme de formation français (Formalogy) :
CRM, apprenants, sessions, documents, signatures, facturation, Qualiopi.

## Nature du produit

Outil **interne**, utilisé par 3 à 5 personnes (le dirigeant, un gestionnaire,
puis des formateurs). Ce n'est **pas** un SaaS multi-clients.

- **Mono-organisme** : pas d'identifiant d'organisation sur les tables.
- **Aucun compte apprenant** : les apprenants sont des fiches en base, jamais
  des utilisateurs authentifiés. Ils signent depuis la page de signature BoldSign et
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
| Accès base | Prisma 7.10.0 (versions figées, pas de bêta ni de RC) |
| Authentification | better-auth (sessions en base) — **jamais** Supabase Auth |
| Stockage documents | Supabase Storage, derrière une abstraction |
| Emails | Compte Gmail dédié, en SMTP avec mot de passe d'application (nodemailer) |
| Signature électronique | BoldSign, région Europe, formule **sans API** (envoi depuis le site BoldSign, retour par email) |
| Facturation externe | Henrri : numéro et PDF saisis à la main tant que la clé API n'est pas fournie (API Henrri existante, bac à sable gratuit) |
| Automatisations | Moteur interne (`lib/automatisations`) + réveil quotidien `POST /api/automatisations/executer` |
| Hébergement | À trancher (Phase 18) |

## Règle impérative : Supabase est de l'infrastructure brute

Supabase fournit **une base PostgreSQL et un espace de fichiers**, accessibles
**uniquement depuis notre serveur**. Interdits :

- ❌ Supabase Auth (on utilise better-auth)
- ❌ Row Level Security (les droits sont vérifiés dans notre code serveur)
- ❌ SDK Supabase côté navigateur

Le client a explicitement rejeté l'ancien modèle où Supabase gérait tout côté
client. Respecter cette règle garantit que la base reste du PostgreSQL standard
et que le projet peut migrer ailleurs en quelques heures.

## Emails et automatisations

- **Verrou d'envoi** : aucun email ne part réellement tant que `EMAILS_ENVOI_REEL`
  ne vaut pas exactement `true` (et que `GMAIL_ADRESSE` et `GMAIL_MOT_DE_PASSE_APPLI`
  sont renseignés). Sinon, les envois sont enregistrés avec le statut `SIMULE`.
  Ne jamais contourner ce verrou pendant des tests : les apprenants sont réels.
- Gmail ne fournit ni accusé de délivrance ni suivi d'ouverture : les statuts
  utiles sont SIMULE, ENVOYE, ECHEC. Plafond interne de 400 envois / 24 h
  (Gmail bloque le compte vers 500).
- Inngest a été écarté au profit d'un moteur interne, jugé suffisant pour le
  volume. Règle DÉCLENCHEUR → CONDITION → ACTION ; chaque cas est réservé par
  une ligne `automation_runs` à clé unique, ce qui interdit tout double envoi.
- Les automatisations livrées sont **désactivées** : leur activation est une
  décision du client.
- Le réveil quotidien exige `Authorization: Bearer <CRON_SECRET>` ; le
  planificateur sera configuré à la mise en ligne (Phase 18).

## Formateurs

- Une fiche formateur (`trainers`) existe sans compte. Un administrateur peut
  lui ouvrir un accès depuis la fiche : compte `FORMATEUR`, mot de passe
  provisoire affiché une seule fois, jamais stocké.
- Un formateur ne voit que « Mes sessions » (hors brouillons) et « Mon compte ».
  Jamais les prix, notes internes, coordonnées ou financements des apprenants.
- Documents visibles par un formateur : liste fermée de types
  (`TYPES_VISIBLES_FORMATEUR` dans `lib/formateurs.ts`), rattachés à ses
  sessions ou aux formations qu'il anime. La même règle filtre la route de
  téléchargement.
- Fermer l'accès ou désactiver la fiche désactive le compte et coupe ses
  connexions ; un compte désactivé ne peut plus se connecter (hook better-auth).

## Signatures électroniques

- Le client a choisi la formule BoldSign sans API (15 $/mois). Une demande de
  signature crée une référence `SIG-AAAA-NNNN` ; le gestionnaire envoie le
  document depuis le site BoldSign avec cette référence en tête du titre.
- L'email de fin de signature (document signé + « Audit Trail » en pièces
  jointes) arrive dans la boîte Gmail dédiée ; `lib/signatures/rapprochement.ts`
  le rattache par sa référence. Un email n'est accepté que si son origine
  BoldSign est authentifiée (DKIM), et n'est examiné qu'une fois (Message-ID).
- Tout ce qui ne se rattache pas reste visible dans « Signatures » ; le dépôt
  manuel du document signé est toujours possible.
- Documents de plus de 5 Mo : BoldSign ne les joint pas, dépôt manuel.
- La relève de la boîte (`lib/signatures/boite-mail.ts`, IMAP en lecture seule)
  tourne avec le réveil `POST /api/automatisations/executer` et via le bouton
  « Relever la boîte maintenant ». À planifier toutes les heures en Phase 18.

## Émargement

- Feuilles d'émargement PDF générées à la demande (une page par jour,
  `lib/emargement-pdf.ts`), à imprimer ou à faire signer via BoldSign ; la
  feuille signée est déposée comme document de type `EMARGEMENT`.
- Les présences (`presences`, une ligne par apprenant et demi-journée) sont
  saisies par l'équipe ou par le formateur de la session, jamais pour un jour
  à venir. Elles serviront aux attestations (Phase 12).

## Fin de formation

- Attestation de fin de formation et certificat de réalisation générés en PDF
  (`lib/attestations-pdf.ts`), rangés comme documents ; régénérer un document
  inchangé ne crée pas de version (métadonnées PDF fixes).
- Préalables : session terminée, informations de l'organisme complètes
  (Paramètres → Organisme), durée en heures de la formation, présences
  complètes et évaluation des acquis de l'apprenant.
- Heures suivies = durée × demi-journées présentes / demi-journées de la session.

## Factures et paiements

- Le numéro légal d'une facture vient toujours de Henrri : Formalogy OS ne
  numérote jamais. Une facture « À émettre » est préparée ici, puis émise dans
  Henrri (numéro, dates et PDF reportés), puis suivie jusqu'au paiement.
- Une facture émise ne se modifie plus ; son annulation (admin) suppose un
  avoir dans Henrri. Montants calculés en centimes entiers ; les paiements ne
  peuvent pas dépasser le reste dû (transaction sérialisable).
- Connexion API Henrri à brancher dès que le client aura créé sa clé Sandbox
  (avatar → API & Intégrations) : documentation accessible une fois connecté.

## Prises en charge (OPCO, France Travail)

- Aucun financeur n'expose d'API : le dossier se dépose sur leur portail et se
  suit dans `/financements` (montants demandé et accordé, dates, subrogation,
  accord de prise en charge en pièce jointe).
- Le déclencheur `DOSSIER_SANS_REPONSE` crée une tâche de relance au bout de
  N jours (15 par défaut). Automatisation livrée désactivée.

## Sécurité

- Les permissions sont vérifiées **côté serveur** à chaque requête. Le frontend
  ne fait jamais autorité.
- Les secrets (clé `service_role` Supabase, clés API) restent côté serveur.
- Trois catégories de routes, protégées différemment :
  1. l'application — session authentifiée + rôle
  2. les webhooks (aucun pour l'instant) — vérification de signature
     cryptographique, horodatage de moins de 5 minutes
  3. les liens à usage unique (questionnaire de satisfaction) — jeton aléatoire
     de 256 bits, seule son empreinte est stockée, expirant après 60 jours,
     une seule réponse possible
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
npm run creer-admin -- <email> "<Prénom Nom>" [ADMIN|GESTIONNAIRE|FORMATEUR]
```

Node.js est installé dans `~/.local/node` (ajouté au PATH via `~/.zshrc`).
