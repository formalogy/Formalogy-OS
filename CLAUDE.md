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
| Facturation externe | Henrri : émission automatique via API (clientId/clientSecret) dès qu'une session se termine ; saisie à la main tant que ces identifiants ne sont pas fournis |
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
- Connexion API Henrri branchée et testée en réel le 19/09/2026 (Phase 16) :
  `lib/henrri/client.ts` (jeton clientId/clientSecret, cache mémoire 10 min) et
  `lib/henrri/facturation.ts` (logique métier). Authentification par
  `clientId`/`clientSecret` (`POST /v1/users/authenticate`), jamais par une
  simple clé — `HENRRI_API_KEY` n'est pas utilisée par le code. **Sur la page
  Henrri « API & Intégrations », le Client ID est le « Clé publique de l'API »
  affiché en GUID sous la clé de test ; le Client Secret ne s'affiche qu'une
  fois, à la génération (icône 🔄 pour le regénérer s'il est perdu) — à ne pas
  confondre avec le login/mot de passe du site Sandbox, affichés juste
  au-dessus et sans rapport avec l'API.**
- **La documentation Scalar/OpenAPI de Henrri (consultée le 18/09/2026) est
  par endroits inexacte** par rapport au comportement réel du bac à sable,
  vérifié en conditions réelles le 19/09/2026 :
  - `documentKind` et les autres valeurs d'énumération sont renvoyées en
    minuscules (`"invoice"`) et non en PascalCase (`"Invoice"`) comme annoncé
    → comparaisons insensibles à la casse dans le code.
  - `GET /v1/documentlinetypes` ne renvoie **pas** le champ `type` documenté
    (Item/Text/…) : seul le libellé français (« Article ») distingue une ligne
    facturable des titres, totaux, textes, etc.
  - Une ligne facturable (`POST /v1/documents/{id}/lines`) **exige** un article
    (`item` en ligne, avec son `itemCategoryId` — catégorie « Services (Forfait) »
    utilisée ici) : la documentation suggérait qu'une simple `description`
    suffisait pour ce type de ligne, ce qui est refusé (HTTP 400).
  - `POST /v1/documents/{id}/finalize` fonctionne de façon fiable et rapide.
  - **`POST /v1/documents/{id}/pdf/url` (et `GET /v1/documents/{id}/pdf`) se
    sont révélés systématiquement en échec sur le bac à sable au moment du
    test** (délai d'environ 30 s puis « The document HTML could not be
    retrieved. The document may not have been rendered yet. »), y compris sur
    des factures finalisées depuis plusieurs minutes — probablement un incident
    ponctuel côté Henrri. Sans conséquence sur la facture elle-même (déjà
    enregistrée, avec son numéro officiel) : seul le PDF manque, à retester
    plus tard ou à récupérer à la main depuis le site Henrri en attendant.

## Facturation automatique en fin de session (Phase 16)

- Nouvelle action d'automatisation `FACTURE_HENRRI`, déclenchée par
  `SESSION_TERMINEE` (même mécanisme que les autres automatisations : réservée
  par un `AutomationRun` à clé unique, ne s'exécute jamais deux fois pour la
  même session). **Livrée désactivée**, comme toutes les automatisations.
- **Une facture par session**, adressée à l'entreprise cliente si la session
  en a une, sinon à l'unique apprenant inscrit. Une session sans entreprise et
  avec zéro ou plusieurs apprenants n'a pas de payeur évident : échec clair
  plutôt que de deviner (visible dans Paramètres → Automatisations et dans le
  journal d'activité).
- Le client Henrri (entreprise ou apprenant) est créé une seule fois : son
  identifiant est mis en cache sur `companies.henrriCustomerId` /
  `learners.henrriCustomerId` et réutilisé ensuite.
- Contenu de la facture : thème (titre = intitulé de la formation), sous-titre
  récapitulant session, dates, modalité (présentiel/distanciel/e-learning/
  hybride), lieu et formateur, ligne unique au prix de la session (TVA 0 %,
  article 261-4-4° du CGI, seul taux utilisé par Formalogy), mention
  d'exonération en pied de page.
- Le document est **finalisé** (numéro définitif, verrouillé côté Henrri) dès
  la création : irréversible. Le PDF est ensuite récupéré et rangé comme
  document (catégorie FINANCE, type FACTURE, rattaché à la session et à
  l'entreprise/l'apprenant) — un échec de cette seule étape n'invalide pas la
  facture, déjà enregistrée avec son numéro.
- Une facture déjà existante pour la session (manuelle ou automatique, hors
  annulée) bloque une nouvelle émission automatique.

## Prises en charge (OPCO, France Travail)

- Aucun financeur n'expose d'API : le dossier se dépose sur leur portail et se
  suit dans `/financements` (montants demandé et accordé, dates, subrogation,
  accord de prise en charge en pièce jointe).
- Le déclencheur `DOSSIER_SANS_REPONSE` crée une tâche de relance au bout de
  N jours (15 par défaut). Automatisation livrée désactivée.

## Qualiopi

- Référentiel suivi : **V10**, décret n° 2026-728 du 1er août 2026, applicable
  aux audits à partir du 1er novembre 2026 — 7 critères, 33 indicateurs.
- Les intitulés sont ceux du décret, chargés en base par migration et non
  modifiables depuis l'application ; seuls le suivi (case « conforme », notes,
  preuves) et l'applicabilité des 11 indicateurs spécifiques se saisissent.
- Une preuve est un document rattaché à un indicateur (`documents.indicateurQualiopi`).
- Le plan d'actions (`actions_qualite`) porte les écarts d'audit, réclamations
  et améliorations : c'est la trace de l'amélioration continue (indicateur 32).
- À la prochaine version du référentiel : ajouter une migration qui met à jour
  les intitulés, sans toucher au suivi saisi par le client.

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
