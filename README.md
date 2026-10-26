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

## Impression : cartons A5 et fiche de gestion A4

Deux boutons dans le plan de battue (et sur la page Battues) : **Cartons de battue** et **Fiche de gestion**. Les anciens carnets et l'ancienne fiche de battue sont remplacés par ces deux documents.

- **Cartons de battue** : A5 paysage, recto-verso, **2 par feuille A4** (même carton répété deux fois ; pas de trait de coupe, la feuille se coupe en deux au milieu). Par défaut, le recto porte l'en-tête, le rendez-vous, un **encart pour écrire à la main les numéros de poste de chaque traque**, le **plan de chasse du jour avec les sonneries** et les consignes ; le verso porte la grande carte avec les postes numérotés à la couleur de leur traque.
- **Fiche de gestion** : A4 recto-verso. Par défaut, le recto porte le conducteur, le chef ou la cheffe de ligne et les véhicules de chaque traque (à saisir dans le plan, rubrique « Équipe de la traque »), puis le nom du chasseur à chaque poste, traque par traque. Le verso porte la grande carte et les cases à remplir (prélèvements par poste, heures des traques, incidents, signatures).

Pour imprimer : bouton « Imprimer », format A4, recto-verso avec retournement sur le **bord long**, échelle 100 %, sans marges ni mise à l'échelle. Pour les cartons, couper ensuite la feuille en deux.

**Tout est modulable**, avec un aperçu à l'échelle réelle qui se met à jour en direct :
- chaque face est une liste de **blocs** (en-tête, informations pratiques, encart des numéros de poste, carte, règles de sécurité, instructions, notes, postes et chasseurs, équipes, tableaux de saisie, bilan, présence et émargement avec assurance, incidents, signatures, texte libre, espace) que l'on active, réordonne (▲ ▼), déplace d'une face à l'autre (⇄), ajoute ou retire ;
- chaque bloc a ses réglages (titre, colonnes, taille du texte, hauteur des lignes, cases à cocher...), une largeur (pleine ou demi-largeur, deux blocs demi-largeur se placent côte à côte) et une hauteur (selon le contenu, place restante ou fixe en mm) ;
- l'apparence se règle globalement : **10 palettes** (Sologne, Brique de Sologne, Étang, Bruyère, Chêne, Forêt profonde, Ardoise, Rouge vénerie, Noir et blanc, et **Personnalisée** où l'on choisit trois couleurs), **7 polices** (selon les polices installées sur l'appareil qui imprime), taille du texte, marges, **cadre** (double filet, simple, épais, pointillé, aucun), **titres de section** (soulignés, bandeau coloré, pastille, barre à gauche, majuscules ou casse normale), **tableaux** (grille, lignes horizontales, zébré, sans bordures), **coins** (arrondis, droits, très arrondis) et **fond** du papier (blanc, crème, vert ou gris très pâle) ;
- l'**en-tête** a 5 styles (bandeau, double filet, centré, encadré, minimal), 4 ornements (feuille de chêne, gland, tête de cerf, cor de chasse) et une taille de titre réglable ;
- le texte libre accepte `{date}`, `{secteur}`, `{rdv_lieu}`, `{rdv_heure}`, `{responsable}`, `{nb_traques}` ;
- un cadre rouge et un message signalent quand une face dépasse la page (le bas serait coupé) ;
- les mises en page se **nomment et s'enregistrent** (« Enregistrer sous… »), se rouvrent et se suppriment. Le travail en cours est aussi gardé dans le navigateur.

## Gibier par catégorie : plan de chasse, prélèvements et autres espèces

Le plan de chasse de la saison et les prélèvements se notent **par catégorie** : Chevreuil, Cerf -8, Cerf +8, Biche, Jeune. Le « réalisé » de chaque attribution se calcule sur sa catégorie. Les anciennes lignes saisies par espèce restent lisibles. Avec « Gérer le gibier et les sonneries » (page Chasse, onglet Plan de chasse, ou fiche d'une battue), on ajoute en un clic une **autre espèce** (sanglier, daim, renard, lièvre, faisan, perdrix, lapin, pigeon ramier, corneille, pie, ragondin, blaireau, mouflon, chamois) ou une catégorie de son choix, on règle la sonnerie, on réordonne et on supprime.

## Plan de chasse du jour et sonneries

Dans la fiche d'une battue (ou d'un modèle), la rubrique **Plan de chasse du jour** liste les catégories de gibier : on coche celles qui peuvent être tirées ce jour-là, avec un nombre autorisé facultatif. La ligne **Chevreuil** propose de préciser chevreuil, chevrette ou chevrillard (aucune case cochée : la ligne affiche « Chevreuil »).

La liste des catégories et leur **sonnerie** sont communes à toutes les battues et se modifient avec « Gérer le gibier et les sonneries » : nom, sonnerie (texte libre), choix possibles (séparés par des virgules), ordre, ajout et suppression. La liste de départ est : Chevreuil (2), Cerf -8 (6), Cerf +8 (6), Biche (4), Jeune (3). Le bloc « Plan de chasse du jour (sonneries) » des cartons et de la fiche affiche les catégories cochées avec leur sonnerie en gros ; il peut ajouter une colonne « nombre autorisé » et une colonne « prélevé » à remplir. Le plan du jour se recopie avec les modèles de battue.

## Plusieurs cartes et cadrage

Un bloc **Carte** peut être ajouté autant de fois que nécessaire (par exemple une carte par groupe de traques éloignées). Chaque carte a :
- ses **traques affichées** (aucune case cochée : toutes), avec sa propre légende ;
- son **fond** : plan IGN, photo aérienne, ou aucun (tracés seuls) ;
- son **cadrage** : « Cadrer » rend la carte déplaçable et zoomable dans l'aperçu (souris, molette ou doigt ; sur un carton, les deux exemplaires suivent), « Figer le cadrage » verrouille la vue et l'enregistre dans la mise en page, « Automatique » revient au cadrage sur les traques. Le cadrage fixe est mémorisé en centre et niveau de zoom : si tu changes la taille du bloc, la zone visible change un peu.

## Annuler et rétablir (Ctrl+Z)

Dans le **plan de battue** et dans la **page d'impression**, Ctrl+Z annule la dernière action et Ctrl+Y (ou Ctrl+Maj+Z) la rétablit ; les boutons « ↶ Annuler » et « ↷ Rétablir » font la même chose. Dans le plan, cela couvre : tracés, suppressions, déplacement d'un point, d'un poste ou d'une poignée, changement de chasseur, ajout et suppression d'une traque, nom, parcelle, équipe et notes d'une traque, réouverture d'une version. Pendant un tracé, Ctrl+Z retire le dernier point posé. Les frappes successives dans un champ ne comptent que pour une action. Dans un champ de saisie, Ctrl+Z reste l'annulation de frappe du navigateur. Ctrl+Z ne fait rien tant qu'une fenêtre est ouverte.

La suppression d'une traque n'est effective en base qu'à « Enregistrer le plan » : on peut donc la défaire par Ctrl+Z jusque-là. Après un enregistrement, on peut encore annuler : la modification est alors à enregistrer de nouveau. L'historique est celui de la page ouverte (100 actions) : il disparaît quand on la quitte.

## Sauvegarde et versions

**Sauvegarde complète** (page Sauvegarde) : un bouton télécharge un fichier avec toutes les données (parcelles, chasseurs, battues, modèles, plans, prélèvements, chantiers...). Les documents déposés ne sont pas inclus. Le site rappelle de sauvegarder si la dernière date de plus de 30 jours. Pour rouvrir un fichier :
- "Ajouter ce qui manque" : les données actuelles ne sont pas touchées, seuls les éléments absents sont ajoutés (on peut le refaire sans créer de doublons) ;
- "Tout remplacer" : les données actuelles sont effacées puis remplacées par celles du fichier. Une copie de sécurité de l'état d'avant est téléchargée automatiquement avant l'effacement.
Le fichier peut aussi servir à déplacer les données d'un projet Supabase à un autre, ou du mode démonstration vers un vrai projet.

**Versions d'un plan** (bouton "Versions" dans le plan de battue) : "Enregistrer une version" garde l'état actuel de l'éditeur, même non enregistré. "Rouvrir" remplace le contenu de l'éditeur par cette version (l'état précédent est gardé automatiquement dans une version "Avant réouverture") ; rien n'est modifié en base tant que tu ne cliques pas sur "Enregistrer le plan". Les traques de même numéro gardent leurs prélèvements.

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
