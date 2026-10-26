# Gestion de propriété forestière — Chasse et travaux (version web)

Site accessible par lien, utilisable sur PC et téléphone, avec cartes IGN et satellite, tracé des parcelles numérotées, plans de battue détaillés (postes, mouvement de chaque traque, ligne des rabatteurs, parkings, accès, prélèvements par traque) et fiches imprimables pour les invités, ainsi que des cartes de chantier imprimables.

## Battues (page d'accueil)

La page Battues est le point central du site. Elle affiche en haut la prochaine battue (date, rendez-vous, responsable, participants, nombre de traques et de postes), avec les boutons "Plan de battue" et "Fiche à imprimer". En dessous : les modèles de battue, les battues à venir et les battues passées.

**Modèles.** Un modèle est une battue sans date, avec ses traques, ses tracés, ses postes, ses parkings, son lieu de rendez-vous et ses consignes. Deux façons d'en avoir un : "Nouveau modèle" (puis bouton "Plan" pour dessiner les traques), ou "Enregistrer comme modèle" sur une battue déjà préparée.

**Créer une battue.** "Nouvelle battue" (ou "Créer une battue" sur un modèle) : tu choisis le modèle et la date. Tout est recopié, puis la fiche s'ouvre pour choisir le responsable et cocher les participants de la journée. Les chasseurs affectés aux postes et les participants ne sont volontairement pas recopiés : ils changent d'une fois sur l'autre. Modifier une battue n'a jamais d'effet sur son modèle, et inversement.

## Plan de battue : une grande carte, trois étapes

Le bouton "Plan de battue" ouvre une grande carte pour toute la journée.

1. **Choisir un outil** : Point (poste, parking, accès), Ligne (point par point), Courbe (lissée, elle passe par chaque point cliqué) ou Polygone (zone fermée).
2. **Dessiner** sur la carte. Double-clic, Entrée ou "Terminer" pour finir un tracé, Échap pour abandonner, "Annuler le dernier point" pour corriger. Pour un polygone, un clic sur le premier point ferme la zone.
3. **Décrire** ce qui vient d'être tracé : poste (avec le chasseur affecté), parking, accès, mouvement de la traque, ligne des rabatteurs, **sens de la battue** (flèche), autre tracé, zone de battue ou zone interdite de tir. Chaque élément est rattaché à une traque, colorée différemment sur la carte.

Un clic sur un élément déjà dessiné rouvre sa description, avec "Modifier la forme" (déplacer, ajouter ou retirer des points) et "Inverser le sens". Les points se déplacent aussi en les faisant glisser. "Enregistrer le plan" sauvegarde toutes les traques ; le site prévient si tu quittes la page avec des modifications non enregistrées. Les postes habituels du territoire se réutilisent grâce à la bibliothèque de postes, et les prélèvements se notent par traque dans le panneau de droite.

La courbe est une courbe lissée qui passe par les points cliqués (pas de poignées de Bézier à régler à la main).

## Impression

Trois documents, accessibles depuis le plan de battue :

- **Fiche de battue** : la carte de la journée avec sa légende, le détail de chaque traque, les participants, les règles de sécurité et les instructions, pour les invités.
- **Carnet de battue** (pour le responsable) : plan de la journée et consignes, feuille de présence et d'émargement (permis et assurance de chaque chasseur, signature), une page par traque avec sa carte et des cases pour noter les prélèvements, bilan de la journée. L'assurance expirée à la date de la battue ou non renseignée est signalée en rouge.
- **Carnets des chasseurs** : une page par participant, avec son poste entouré en rouge sur la carte de sa traque, son assurance, les consignes et un tableau pour noter ses tirs.

## Ajouter une parcelle par sa référence cadastrale

Sur la page Parcelles, "Ajouter par référence cadastrale" : tape la commune (choisis-la dans la liste), la section (ex : AB) et le numéro (ex : 12). Le contour officiel et la surface sont récupérés automatiquement auprès du cadastre IGN (gratuit, internet nécessaire), puis la fiche s'ouvre pré-remplie pour que tu choisisses le nom d'usage, la commune, etc. Le champ "préfixe" ne sert que dans les communes fusionnées, où un même numéro peut exister deux fois. Si une parcelle est composée de plusieurs morceaux séparés, seul le plus grand est repris.

## Modifier le contour d'une parcelle

Sélectionne la parcelle dans la liste, clique sur "Modifier le contour", déplace les points blancs sur la carte, puis "Valider le contour" (ou "Annuler").

## Utilisation hors ligne (en forêt)

Après une première visite avec du réseau, le site s'ouvre sans connexion. Pour avoir aussi les fonds de carte : sur la page Parcelles, zoome sur le secteur concerné puis clique sur "Télécharger cette zone hors ligne" (plan et photo aérienne). Ce qui fonctionne sans réseau : ouvrir les pages déjà visitées, consulter les cartes de la zone téléchargée et les dernières données chargées. Ce qui ne fonctionne pas : toute modification (ajout, changement, suppression) et l'ouverture d'une page jamais visitée. Faire cette préparation la veille, avec du réseau, sur le téléphone qui sera utilisé. À la déconnexion, les données mises en cache sont effacées.

## Mode démonstration

Le site fonctionne immédiatement sans aucune configuration : tant que `js/config.js` contient encore les valeurs par défaut, l'application bascule sur un mode démonstration qui stocke les données dans le navigateur. Identifiant : `demo@foret.local`, mot de passe `demo`. Pratique pour prendre en main l'application avant de créer le vrai projet, mais les données ne sont pas partagées entre appareils dans ce mode, et disparaissent si tu vides les données du navigateur.

Pour un usage réel (accès partagé, multi-appareils), il faut créer un projet Supabase (gratuit) et publier le site. Voici comment, étape par étape.

## Étape 1 — Créer le projet Supabase

1. Va sur [supabase.com](https://supabase.com) et crée un compte gratuit.
2. Crée un nouveau projet (choisis une région proche, Europe par exemple). Note le mot de passe de base de données que Supabase te propose, au cas où.
3. Attends une minute ou deux que le projet soit prêt.

## Étape 2 — Créer les tables

1. Dans le menu de gauche, ouvre **SQL Editor**.
2. Ouvre le fichier `schema.sql` de ce projet, copie tout son contenu, colle-le dans l'éditeur SQL de Supabase.
3. Clique sur **Run**. Toutes les tables, les règles d'accès et les espèces de gibier de référence sont créées en une fois.

## Étape 3 — Créer le compte partagé

L'application utilise un seul identifiant/mot de passe pour toute l'association (gestionnaire, chasseurs, bûcherons s'y connectent tous avec les mêmes identifiants).

1. Dans le menu de gauche, ouvre **Authentication → Users**.
2. Clique sur **Add user → Create new user**.
3. Renseigne un email (peut être fictif, par exemple `chasse@tonassociation.fr`) et un mot de passe. Décoche l'envoi d'email de confirmation si l'option apparaît, ou coche directement "Auto Confirm User".
4. C'est cet email et ce mot de passe que tu communiques à tout le monde.

## Étape 4 — Récupérer les clés et configurer le site

1. Dans le menu de gauche, ouvre **Project Settings → API**.
2. Copie la valeur **Project URL**.
3. Copie la valeur **anon public** (la clé publique, pas la clé `service_role` qui elle doit rester secrète).
4. Ouvre le fichier `js/config.js` de ce projet et remplace les deux valeurs par défaut par celles-ci.

Ces deux valeurs ne sont pas secrètes au sens strict : elles seront visibles par quiconque regarde le code source du site. C'est normal, c'est comme ça que Supabase fonctionne. La vraie protection vient des règles d'accès créées à l'étape 2, qui exigent d'être connecté avec le compte partagé pour lire ou modifier quoi que ce soit.

## Étape 5 — Publier sur GitHub Pages

1. Crée un dépôt GitHub (public ou privé, les deux fonctionnent avec GitHub Pages si ton compte le permet).
2. Mets-y tout le contenu de ce dossier (`index.html`, `css/`, `js/`, `pages/`, etc., y compris `js/config.js` une fois rempli).
3. Dans le dépôt GitHub, va dans **Settings → Pages**.
4. Dans "Build and deployment", choisis **Deploy from a branch**, branche `main`, dossier `/ (root)`.
5. Attends une minute, GitHub affiche le lien du site (de la forme `https://tonpseudo.github.io/nomdudepot/`).

C'est ce lien que tu partages. Il s'ouvre sur PC comme sur téléphone, pas d'installation nécessaire.

## À savoir pour l'usage courant

Le projet Supabase gratuit se met en pause automatiquement après une semaine complète sans aucune activité. Les données ne sont jamais perdues, mais le site renvoie une erreur de connexion tant que le projet n'est pas relancé : il suffit alors de se reconnecter une fois au tableau de bord Supabase, où un bouton permet de le réveiller. En pleine saison de chasse ou de travaux, ça n'arrive pas ; ça peut arriver en période creuse.

Les fonds de carte (plan IGN et photo aérienne) viennent du service public gratuit de l'IGN (data.geopf.fr). Ils nécessitent une connexion internet à chaque consultation de carte ; si la connexion manque, le reste du site continue de fonctionner normalement, seule la carte affiche un message.

## Mettre à jour le site après une modification

Si tu me redemandes des modifications plus tard, je republierai les fichiers modifiés. Il te suffira de les remettre dans ton dépôt GitHub (remplacer les fichiers, puis valider/"commit") ; GitHub Pages republie automatiquement le site en une minute ou deux.

Si une mise à jour ajoute de nouvelles tables (c'est le cas pour les plans de battue détaillés), il faut aussi recopier le contenu de `schema.sql` dans l'éditeur SQL de Supabase et cliquer "Run" une nouvelle fois : le script est rejouable sans danger, il ne touche pas aux données déjà présentes et ajoute seulement ce qui manque.

## Limites connues de cette version

- Impression : la mise en page d'impression dépend du navigateur utilisé. Le rendu est optimisé pour Chrome et Firefox ; teste une impression avant un usage en situation réelle.
- Hors ligne : voir la section dédiée ci-dessus. Les modifications saisies sans réseau ne sont pas enregistrées, elles sont refusées avec un message.
- Un seul niveau d'accès (compte partagé unique) : pas de distinction entre ce qu'un gestionnaire et un simple chasseur peuvent faire.
- Pas d'export PDF autre que l'impression navigateur (Fichier → Imprimer → Enregistrer en PDF fonctionne très bien en pratique).
