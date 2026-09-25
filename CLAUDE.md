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
| Emails | Compte Gmail dédié `formalogy.pro@gmail.com`, en SMTP avec mot de passe d'application (nodemailer) |
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
- Gmail ne fournit aucun accusé de délivrance. L'ouverture est suivie par
  l'application elle-même : chaque email réellement envoyé porte un pixel
  (`pixelSuivi`, route publique `/api/emails/[id]/pixel`) qui le fait passer
  de ENVOYE à OUVERT. Statuts : SIMULE, ENVOYE, OUVERT, ECHEC. Plafond interne
  de 400 envois / 24 h (Gmail bloque le compte vers 500). *À vérifier :
  conformité CNIL de ce pixel (consentement), non tranchée.*
- Compte d'envoi : `formalogy.pro@gmail.com` (remplace
  `formalogy.formation@gmail.com`), connecté le 24/09/2026, SMTP et IMAP
  vérifiés. `npm run tester-gmail` contrôle la connexion **sans envoyer
  aucun email** ; `npm run configurer-gmail` saisit le mot de passe
  d'application en masqué dans `.env`. Ce mot de passe (16 lettres, espaces
  indifférents) exige la validation en deux étapes du compte Google ; ce
  n'est jamais le mot de passe du compte.
- Pièces jointes : l'action EMAIL accepte `joindre` (CONVENTION, CONVOCATION,
  ATTESTATION, CERTIFICAT) ; le document PDF rangé pour la session et
  l'apprenant est joint, l'email part sans lui s'il manque. Tous les
  documents envoyés sont des PDF.
- Inngest a été écarté au profit d'un moteur interne, jugé suffisant pour le
  volume. Règle DÉCLENCHEUR → CONDITION → ACTION ; chaque cas est réservé par
  une ligne `automation_runs` à clé unique, ce qui interdit tout double envoi.
- Activation : décision du client, qui a demandé que **toutes** les
  automatisations soient actives. Au 25/09/2026 : 14 actives sur 15 ; seule
  « Convocation à l'inscription » est éteinte (même modèle d'email que la
  convocation de J-7 mais sans le PDF : active, elle partait la première et
  bloquait l'envoi de la vraie convocation). Une automatisation nouvelle est
  livrée active.
- Destinataires d'une action EMAIL : `APPRENANT`, `APPRENANTS_SESSION`,
  `FORMATEUR_SESSION` (le formateur de la session ; un seul envoi du même
  modèle par session, un par jour pour `SESSION_JOUR`), `PAYEUR` (payeur de
  la facture émise pour la session, avec son PDF — rien ne part sans facture
  ni PDF ; disponible mais **non utilisé** : le client ne veut pas d'envoi de
  facture, voir Facturation automatique), `FORMATEURS_ACTIFS`, `FINANCEURS_ANNEE` (contacts des dossiers de
  financement des 365 derniers jours, dédoublonnés par adresse).
- Paramètre `heure` (heure de Paris) sur tous les déclencheurs datés : le
  jour prévu, l'envoi attend cette heure ; passé ce jour (réveil manqué), il
  part sans attendre. Accueil à 8 h, feuille d'émargement à 7 h, fin de
  formation et bilan du formateur à 16 h.
- **Un envoi par apprenant** : la clé d'un cas de session contient une
  empreinte de la liste des inscrits (`empreinteInscrits`). Une inscription
  tardive rouvre le cas ; ceux qui ont déjà reçu le même modèle pour la même
  session sont écartés (`dejaServis`), un envoi en ECHEC restant retentable.
  Conséquence : deux automatisations qui utilisent le même modèle d'email
  pour une session ne servent un apprenant qu'une fois.
- **Pas de rattrapage à l'activation** : `automations.activeeAt` (date de la
  dernière activation) borne les déclencheurs « après la fin » et les
  campagnes, pour qu'activer une automatisation ne déclenche pas une rafale
  sur l'historique.
- Déclencheur `CAMPAGNE_ANNUELLE` (jour, mois, heure de Paris) : une fois par
  an, jamais avant l'heure dite. Livrées : questionnaire des formateurs le
  15/12 et des financeurs le 25/01, à 10 h.
- Les sessions en brouillon (et annulées) sont ignorées par les déclencheurs
  datés : c'est le bouton « Lancer le déroulement automatique » de la fiche
  session qui les fait passer à « À préparer » et exécute aussitôt les
  automatisations planifiées. Attention : cette exécution porte sur **toutes**
  les sessions, pas seulement celle qu'on lance. Le déclencheur
  `INSCRIPTION_SESSION`, lui, part à l'inscription quel que soit le statut.
- Une exécution en échec se relance depuis Paramètres → Automatisations
  (bouton « Relancer », admin) une fois la cause corrigée (`relancerExecution`) :
  même clé, rien de ce qui avait abouti ne se refait.

## Déroulement sans intervention (principe du client, 25/09/2026)

Après « Lancer le déroulement automatique », une session se déroule seule
jusqu'à la facture. **On présume que tout se passe bien** ; le client
n'intervient qu'en cas de problème (absence, report, annulation…).

- **Statuts par le calendrier** (`avancerSessions`, au début de chaque
  réveil) : « En cours » dès le premier jour, « Terminée » le lendemain du
  dernier, ce qui déclenche `SESSION_TERMINEE` (facture). Même règle que le
  changement manuel (`lib/sessions-statut.ts`).
- **Calendrier d'une session** : J-15 positionnement + convention ; J-7
  convocation PDF ; J-2 rappel ; chaque matin de session, feuille
  d'émargement du jour au formateur (déclencheur `SESSION_JOUR`) ; J0 8 h
  accueil ; dernier jour 16 h, mail de fin avec le lien du questionnaire de
  satisfaction, et bilan du formateur avec **l'évaluation des acquis** de
  chaque apprenant ; J+1 passage à « Terminée », facture Henrri émise et
  rangée dans le dossier de l'apprenant (pas envoyée), attestation et
  certificat envoyés aux apprenants évalués ; J+60 questionnaire à froid.
- **Présomption de présence** : une demi-journée sans saisie compte comme une
  présence (heures suivies, statistiques d'assiduité). Seules les absences se
  signalent ; la grille affiche « Présumé présent ».
- **Évaluation des acquis** : transmise par le formateur dans son bilan de
  fin de session (section fixe du questionnaire `CHAUD_FORMATEUR`, non
  modifiable depuis l'éditeur ; `lib/questionnaires.ts`,
  `evaluationDemandee`). Sans elle, l'attestation attend : la clé des
  déclencheurs « après la fin » contient une empreinte des évaluations, si
  bien que chaque évaluation reçue rouvre le cas, et un email dont
  l'attestation ou le certificat manque n'est pas envoyé (il attend).
- **Alerte du client** : bouton « Suspendre le déroulement » sur la fiche
  session (`sessions.deroulementSuspenduAt`) ; tant qu'il est posé, aucun
  déclencheur ne regarde la session (ni envoi, ni statut, ni facture). La
  reprise relance ce qui est dû, et les suites de fin si la session a été
  terminée entre-temps. « Annulée » arrête tout définitivement.
- **Ce qui bloque** s'affiche au tableau de bord, bloc « À surveiller »
  (`lib/deroulement-alertes.ts`) : session suspendue, formateur absent ou
  sans email, apprenant sans email, évaluation attendue, facture non émise,
  PDF de facture non récupéré, automatisation en échec.
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

- Feuilles d'émargement PDF générées à la demande (une page par
  demi-journée, une seule colonne « Signature », `lib/emargement-pdf.ts`),
  affichées avant impression, à imprimer ou à faire signer via BoldSign ; la
  feuille signée est déposée comme document de type `EMARGEMENT`. Seuls les
  jours déjà arrivés sont produits (jamais à l'avance). Les
  horaires de la session se saisissent « matin / après-midi », séparés par
  une barre oblique.
- Les présences (`presences`, une ligne par apprenant et demi-journée) ne se
  saisissent que pour une absence (présomption de présence, voir
  « Déroulement sans intervention »), par l'équipe ou par le formateur de la
  session, jamais pour un jour à venir.

## Fin de formation

- Attestation de fin de formation et certificat de réalisation générés en PDF
  (`lib/attestations-pdf.ts`), rangés comme documents ; régénérer un document
  inchangé ne crée pas de version (métadonnées PDF fixes).
- Préalables : session terminée, informations de l'organisme complètes
  (Paramètres → Organisme), durée en heures de la formation et évaluation
  des acquis de l'apprenant (transmise par le formateur). Les présences sont
  présumées : seule une absence signalée réduit les heures.
- Heures suivies = durée × demi-journées présentes / demi-journées de la session.
- L'automatisation « Documents de fin de formation » (J+1 après la fin)
  génère attestation et certificat (action `DOCUMENTS_FIN_FORMATION`) puis
  les envoie en pièces jointes (modèle `DOCUMENTS_FIN`) ; un apprenant pas
  encore évalué les reçoit dès que l'évaluation du formateur arrive.

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
  - Les champs d'énumération (`type` de `GET /v1/documentlinetypes`,
    `itemCategoryKind`, `documentKind`) reviennent tantôt en texte
    (`"item"`), tantôt en entier brut (`1`, `7`…) : `memeValeur` n'accepte
    que le texte, et le libellé français (« Article ») sert de repli pour
    reconnaître une ligne facturable. Aucune catégorie n'est choisie par
    défaut : sans catégorie « service », l'émission échoue clairement (le
    repli silencieux choisissait « Produits » à 20 % de TVA).
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
    enregistrée, avec son numéro officiel) : seul le PDF manquait.
    **Retesté le 23/09/2026 : le PDF est de nouveau récupéré et rangé**
    (facture n° 26-10-4 du bac à sable). Si l'incident revient, le PDF se
    récupère à la main depuis le site Henrri.

## Facturation automatique en fin de session (Phase 16)

- Action d'automatisation `FACTURE_HENRRI`, déclenchée par `SESSION_TERMINEE`,
  c'est-à-dire le lendemain du dernier jour (passage automatique à
  « Terminée ») ou au passage manuel (même mécanisme que les autres
  automatisations : réservée par un `AutomationRun` à clé unique, ne
  s'exécute jamais deux fois pour la même session). **La facture n'est
  envoyée à personne** (décision du client du 25/09/2026) : pour le CPF, le
  payeur est la Caisse des Dépôts, qui se facture sur sa propre plateforme,
  hors de portée de l'application. Le modèle d'email `FACTURE` existe mais
  reste désactivé. En cas d'échec (prix manquant, payeur ambigu, Henrri
  injoignable), alerte au tableau de bord et bouton « Relancer ».
- **Destinataires** (`destinataires` dans `lib/henrri/facturation.ts`) :
  - session avec une entreprise cliente : **une facture**, à l'entreprise ;
  - sinon, **une facture par apprenant financé par le CPF**, adressée à la
    **Caisse des Dépôts et Consignations** (décision du client du
    25/09/2026 : EDOF facture dossier par dossier). L'identité de
    l'apprenant et son numéro de dossier CPF (`learners.numeroDossierCpf`)
    figurent dans le **corps** de la facture (sous-titre et ligne), jamais
    dans les coordonnées du client. Le numéro d'offre, référence interne,
    n'y figure pas (choix du client). Sans numéro de dossier : échec clair,
    alerte au tableau de bord ;
  - un apprenant hors CPF sans entreprise paie lui-même ; plusieurs dans ce
    cas n'ont pas de payeur évident : échec clair plutôt que de deviner.
  Un destinataire déjà facturé est passé : une relance ne crée que les
  factures manquantes. Une facture saisie à la main pour la session bloque
  toute émission automatique. Montant : le prix de la session pour la
  facture d'entreprise ; pour une facture personnelle (CPF, apprenant
  payeur), **le tarif indiqué à l'inscription** (`session_learners.prixHT`),
  à défaut le prix de la session.
- Pour le CPF, la facture Henrri fournit le numéro à saisir dans EDOF ; la
  transmission dans EDOF reste manuelle (aucun accès pour un logiciel tiers).
- Le client Henrri est créé une seule fois : identifiant mis en cache sur
  `companies.henrriCustomerId`, `learners.henrriCustomerId` et, pour la
  Caisse des Dépôts, `organisme.henrriCaisseDepotsId`. **Ces identifiants
  sont ceux du bac à sable** : au passage de Henrri en production, les vider
  pour que les clients soient recréés dans le vrai compte.
- Henrri injoignable : message lisible (« Henrri ne répond pas… »), puis
  « Relancer » une fois le service revenu.
- Contenu de la facture : thème (titre = intitulé de la formation), sous-titre
  récapitulant session, dates, modalité (présentiel/distanciel/e-learning/
  hybride), lieu et formateur, ligne unique au prix de la session (TVA 0 %,
  article 261-4-4° du CGI, seul taux utilisé par Formalogy), mention
  d'exonération en pied de page.
- Le document est **finalisé** (numéro définitif, verrouillé côté Henrri) dès
  la création : irréversible. Le PDF est ensuite récupéré et rangé comme
  document (catégorie FINANCE, type FACTURE, rattaché à la session, à
  l'entreprise payeuse et **au dossier de l'apprenant** : l'apprenant payeur,
  ou l'unique inscrit d'une session payée par une entreprise ; une session à
  plusieurs apprenants garde la facture sur la session et l'entreprise) — un échec de cette seule étape n'invalide pas la
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

## Sessions

- Statuts proposés à l'écran (`STATUTS_PROPOSES`, `lib/sessions-libelles.ts`) :
  brouillon, à préparer, en cours, terminée, clôturée, annulée.
  `DOCUMENTS_EN_ATTENTE` et `PRETE` restent dans l'énumération (données
  existantes) mais ne se choisissent plus.
- Une session se crée en brouillon, sans choix de statut. Le bouton « Lancer
  le déroulement automatique » la met en route ; ensuite le calendrier la
  fait passer seul « En cours » puis « Terminée » (voir « Déroulement sans
  intervention »). Le changement manuel de statut reste possible.
- **Tarif à l'inscription** (décision du client du 25/09/2026) : inscrire un
  apprenant demande son tarif HT, proposé d'après le prix de la session
  (depuis la session comme depuis la fiche apprenant). Il se corrige dans la
  liste des inscrits tant que sa facture personnelle n'est pas émise.
- Tableau de bord : « Entrées / Sorties de formation aujourd'hui » listent
  chaque apprenant inscrit avec sa session, quel que soit le statut (sauf
  session annulée).

## Documents générés

- **Conventions** : modèles Word déposés dans Documents, types
  `MODELE_CONVENTION_PARTICULIER` et `MODELE_CONVENTION_ENTREPRISE` (session
  avec ou sans entreprise). Marqueurs `«NOM»` remplis par
  `lib/conventions-docx.ts` (valeurs dans `lib/conventions.ts`). Les
  `MARQUEURS_SANS_SOURCE` (civilité, moyens pédagogiques, code APE,
  représentant légal…) n'ont aucune donnée en base : ils restent visibles
  tels quels (`«CIVILITE»`) dans la convention, à compléter à la main ; `«TRAIT»`
  est un marqueur de mise en page (filet). Le Word rempli est converti en PDF
  par un moteur maison (`lib/docx-vers-pdf.ts`, sans LibreOffice : aucune
  contrainte d'hébergement), la signature de l'organisme apposée, puis rangé
  comme document de type `CONVENTION`. Génération manuelle depuis la fiche
  session, ou jointe au questionnaire de positionnement à J-15. Un modèle
  Word s'affiche en aperçu PDF dans l'application
  (`/api/documents/versions/[id]?apercu`).
- **Convocation** : PDF construit par `lib/convocation-pdf.ts` sur le modèle
  fourni par le client (en-tête avec logo, tableau des séances par
  demi-journée, lieu, formateur, référents), rangé comme document de type
  `CONVOCATION` et joint à l'email de J-7.
- **Logo et signature** de l'organisme : Paramètres → Organisme, stockés dans
  Supabase Storage (`lib/organisme-signature.ts`), servis aux seuls
  administrateurs et gestionnaires (`/api/organisme/image`). Le fond clair
  d'une image peut être retiré dans le navigateur au dépôt. Logo en tête de
  la convocation, de l'attestation et du certificat ; signature sur ces trois
  documents et sur la convention.
- **Référents** (handicap, administratif, données personnelles) : saisis dans
  Paramètres → Organisme ; une rubrique de la convocation n'apparaît que si
  son référent est renseigné.

## Questionnaires qualité

- Cinq types (`TypeQuestionnaire`) à côté du questionnaire de satisfaction
  apprenant, inchangé : `POSITIONNEMENT` (attentes et positionnement, avant
  la formation), `FROID` (à 60 jours), `CHAUD_FORMATEUR`,
  `SATISFACTION_FORMATEUR`, `FINANCEUR`. Même mécanique de lien à usage
  unique que la satisfaction (`lib/questionnaires.ts`, remplissage public
  `/questionnaires/[jeton]`, et `/questionnaire/[jeton]` pour la satisfaction).
- **Questionnaires modifiables** (demande du client, 24/09/2026) : titre,
  introduction et questions des six questionnaires (les cinq ci-dessus et la
  satisfaction à chaud, code `SATISFACTION`) se modifient dans Questionnaires
  → Modifier les questionnaires (admin et gestionnaire), avec aperçu et
  retour à l'origine. Versions d'origine dans `QUESTIONNAIRES_ORIGINE`
  (`lib/questionnaires-questions.ts`) ; une version modifiée est une ligne de
  `modeles_questionnaire` (sans ligne = origine). Lecture et contrôles dans
  `lib/questionnaires-modeles.ts`.
- Quatre formes de réponse, toutes en **cases à cocher** sauf la dernière :
  une seule réponse, plusieurs réponses, note de 1 à 5 (« Pas du tout » →
  « Tout à fait », seule forme chiffrée), réponse libre. Formulaire public
  commun : `app/_composants/formulaire-questionnaire.tsx`.
- Chaque question a un identifiant stable (reformuler la garde comparable).
  Les réponses sont rangées par identifiant et **les questions posées sont
  figées avec la réponse** (colonne `questions`) : modifier un questionnaire
  ne change jamais le sens d'une réponse reçue. Un questionnaire envoyé mais
  pas encore rempli montre la version en vigueur au moment où il est rempli.
- Satisfaction : `noteGlobale` = la note cochée « satisfaction générale »,
  sinon la moyenne arrondie des notes. Statistiques et page « Fin de
  formation » lisent les notes détaillées dans les questions figées
  (`notesDetaillees`).
- Envoi : POSITIONNEMENT à J-15 (avec la convention), satisfaction à chaud
  le dernier jour à 16 h (lien dans le mail de fin de formation),
  CHAUD_FORMATEUR le dernier jour à 16 h (avec l'évaluation des acquis),
  FROID à J+60, campagnes annuelles pour formateurs et financeurs. Tous
  s'envoient aussi à la main depuis `/questionnaires` (la satisfaction depuis
  la page « Fin de formation » de la session).
- Les réponses s'affichent dans `/questionnaires` et sur les fiches
  apprenant, formateur et dossier de financement.
- Bibliothèque : six types de documents `QUESTIONNAIRE_*` (positionnement,
  à chaud apprenant, à chaud formateur, à froid, financeur, annuel
  formateurs) pour ranger les modèles de l'organisme ou des exemplaires
  papier remplis. Ils sont indépendants des questionnaires en ligne.

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
  sans compte apprenant. Export et anonymisation depuis chaque fiche apprenant
  (Phase 17, voir `lib/rgpd.ts`) : l'anonymisation vide identité et coordonnées
  mais conserve les enregistrements liés (sessions, factures, évaluations),
  la loi imposant leur conservation (comptabilité, traçabilité Qualiopi).

## Administration (Phase 17)

- **Utilisateurs** (`/parametres/utilisateurs`, admin) : crée et gère les
  comptes internes (ADMIN, GESTIONNAIRE) — même mécanisme que l'ouverture
  d'accès d'un formateur (mot de passe provisoire affiché une seule fois,
  session coupée à la désactivation). Un administrateur ne peut ni désactiver
  ni se retirer le rôle à lui-même, ni retirer le dernier administrateur actif.
  Les formateurs restent gérés depuis leur fiche (Phase 10), pas ici.
- **Rôles et permissions** (`/parametres/roles`) : page de référence, pas un
  éditeur — le projet a délibérément trois rôles fixes, sans table de
  permissions fines (voir plus haut).
- **Intégrations** (`/parametres/integrations`) : état de chaque service
  externe (Gmail, Supabase, BoldSign, Henrri, réveil quotidien), lecture seule
  à partir des variables d'environnement — aucune clé ne se modifie depuis
  l'application.
- **API** (`/parametres/api`) : Formalogy OS n'expose pas d'API pour des
  tiers ; cette page documente uniquement le réveil `POST
  /api/automatisations/executer`, à l'usage de qui configurera le
  planificateur externe à la mise en ligne (Phase 18).
- Le champ `User.lastLoginAt`, présent depuis le début mais jamais renseigné,
  est maintenant mis à jour à chaque connexion réussie (hook `after` dans
  `lib/auth.ts`).
- **Statistiques** (`/statistiques`, admin et gestionnaire) : chiffre
  d'affaires facturé et encaissé, remplissage, assiduité, satisfaction et
  résultats des évaluations, pour une année choisie. Page de lecture seule,
  calculée à la demande (`lib/statistiques.ts`) : aucun chiffre n'est stocké,
  rien n'est à recalculer. Sessions en brouillon et annulées exclues ;
  chiffre d'affaires = factures portant un numéro Henrri, les factures
  « à émettre » n'en font pas partie. Construite le 23/09/2026, après la
  Phase 17 : le numéro qui lui était réservé avait servi entre-temps à la
  facturation automatique Henrri (Phase 16), à la demande du client.

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
npm run tester-gmail      # vérifie SMTP et IMAP, sans rien envoyer
npm run configurer-gmail  # saisit le mot de passe d'application (masqué)
```

Node.js est installé dans `~/.local/node` (ajouté au PATH via `~/.zshrc`).
