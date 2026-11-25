# Récapitulatif du site Forêt & Chasse (V0.1)

Adresse : https://pat-guy.github.io/propriete/
Dépôt : pat-guy/propriete (branche de travail et branche principale publiées ensemble)
État au 25/11/2026 : 32 commits, 23 scénarios de test automatisés, tous au vert.

## 1. À quoi sert le site

Gérer la chasse d'un territoire forestier en Sologne, de la préparation à la saisie sur le terrain. Les objectifs, dans l'ordre où vous les avez exprimés :

1. Organiser des battues avec des traques réutilisables d'une journée à l'autre (une traque se dessine une fois, on la reprend ensuite).
2. Préparer et imprimer deux documents : les cartons de battue A5 recto-verso (deux par feuille A4) pour les chasseurs, et une fiche de gestion A4 recto-verso pour vous.
3. Noter vite les prélèvements au poste, depuis le téléphone, même sans réseau.
4. Retrouver ses données sur le PC et sur le téléphone.
5. Suivre le plan de chasse de la saison (catégories, sonneries, réalisé).

Ce qui a été retiré à votre demande : les informations de propriétaire et toute la partie finance. Les chantiers forestiers (page Travaux) existent encore mais ne sont pas le cœur du site.

## 2. Qui l'utilise et comment

Un seul compte partagé donne accès à tout (pas de niveaux de droits). Le site fonctionne dans un navigateur, sur PC comme sur téléphone, et peut être ajouté à l'écran d'accueil du téléphone. Les données sont stockées soit dans le navigateur (mode démonstration, identifiant demo@foret.local / demo), soit dans une base Supabase partagée si elle est configurée. Dans le mode démonstration, le téléphone et le PC ne partagent rien : c'est le point à trancher en premier (voir section 9).

## 3. Les pages

Battues (page d'accueil) : la prochaine battue en haut, puis les modèles, les battues à venir et les battues passées. C'est le centre du site.
Parcelles : carte IGN ou satellite, contours, ajout d'une parcelle par référence cadastrale, modification du contour, téléchargement d'une zone pour la carte hors ligne.
Chasse : plan de chasse de la saison par catégorie, prélèvements, gestion du gibier et des sonneries, chasseurs (avec assurance de chasse).
Travaux : chantiers et prestataires.
Sauvegarde : fichier complet des données, restauration (ajouter ce qui manque, ou tout remplacer avec copie de sécurité automatique).
Aide : mode d'emploi pas à pas.
Pages liées à une battue : Plan de battue, Impression (cartons et fiche), Saisie rapide, Échange (lien PC et téléphone).

## 4. Le modèle de travail

Trois niveaux : une traque (un passage, avec ses tracés, postes, parkings, accès), un modèle de battue (un plan sans date regroupant des traques), une battue (une vraie journée, avec date, participants, prélèvements). Créer une battue recopie un modèle ; modifier l'une ne touche jamais l'autre. Les chasseurs affectés aux postes ne sont volontairement pas recopiés.

« Reprendre une traque déjà faite » dans l'éditeur de plan copie une ou plusieurs traques d'autres battues ou modèles (sans les chasseurs, avec la parcelle). C'est ce qui permet de monter une journée à plusieurs traques sans rien redessiner.

## 5. L'éditeur de plan de battue

Une grande carte en trois étapes : choisir un outil (point, ligne, courbe lissée, polygone), dessiner, décrire.

Chaque objet a son propre figuré, lisible aussi en noir et blanc, sans texte affiché sur la carte :
- poste fixe : rond numéroté, à la couleur de sa traque ;
- poste mouvant : trait orange pointillé épais avec flèche et badge rectangulaire M1, M2 (affectable à un chasseur) ;
- parking : carré bleu avec un P ;
- accès : losange brun avec un point ;
- zone de battue : trait plein ; zone de rapproché : tirets orange ; zone interdite de tir : rouge avec un disque barré ;
- mouvement de traque, ligne de rabatteurs, sens de la battue : lignes avec flèche.

Autour du dessin : équipe de chaque traque (plusieurs conducteurs, chef de ligne, plusieurs véhicules). Chaque véhicule peut porter les postes qu'il dépose et la personne qui le conduit ; les véhicules déjà utilisés se rajoutent en un clic. Annuler et rétablir (Ctrl+Z), versions du plan, bibliothèque de postes, prélèvements par traque.

## 6. Impression

Cartons A5 : recto avec en-tête, rendez-vous, encart pour écrire à la main les numéros de poste de chaque traque, plan de chasse du jour avec sonneries et nombre à tirer, signaux au cor (départ 1 coup long, arrêt temporaire 2 coups longs facultatif, fin 3 coups longs) et règles de sécurité adaptées à la Sologne. Verso : une carte par traque, côte à côte, cadrée sur sa traque, avec légende à symboles et taille des figurés réglable par carte.

Fiche de gestion A4 : plan de chasse du jour, équipes (conducteurs, chef de ligne, véhicules avec leurs postes), postes et chasseurs par traque avec une colonne « Emmené par », puis au verso la carte et les cases de saisie. Elle se compacte seule à trois traques.

Tout est modulable avec aperçu à l'échelle réelle : blocs activables, réordonnables, 10 palettes, 7 polices, cadres, titres, tableaux, en-têtes et ornements. Un cadre rouge prévient quand une face dépasse la page. Les mises en page se nomment, s'enregistrent et se rouvrent.

## 7. Terrain, partage et sécurité des données

Saisie rapide des prélèvements : gros boutons sur téléphone (traque, poste, catégorie), compteurs par catégorie qui passent à l'orange puis au rouge, annulation immédiate, détails facultatifs. Sans réseau, les prélèvements attendent dans le téléphone et partent au retour du réseau, sans doublon.

Échange sans base commune : un lien (ou un fichier) créé sur le téléphone se rouvre sur le PC avec aperçu avant import. C'est manuel et dans un sens à la fois.

Sauvegarde : un fichier téléchargeable contient toutes les données. Le site rappelle de sauvegarder après 30 jours.

Hors ligne : le site s'ouvre sans réseau après une première visite, et une zone de carte peut être téléchargée à l'avance.

## 8. Technique, en bref

Site statique en HTML, CSS et JavaScript sans outil de compilation, hébergé sur GitHub Pages. Cartes Leaflet avec fonds IGN. Base Supabase en option, avec un mode démonstration qui reproduit la base dans le navigateur. Fichier schema.sql rejouable sans risque. Service worker en mode réseau d'abord pour éviter les versions périmées. 23 tests automatisés (Playwright) couvrent les parcours : plan, impression, saisie, échange, sauvegarde, hors ligne.

## 9. Limites et points à surveiller (honnêtement)

- Mode démonstration : tant que Supabase n'est pas branché, les données restent dans un seul navigateur. Pour retrouver le travail du PC sur le téléphone, il faut soit brancher Supabase (il faut l'adresse du projet et la clé publique « anon », jamais la clé service_role), soit passer par la sauvegarde ou le lien d'échange.
- Un seul compte partagé : pas de droits différents entre responsable et simple chasseur.
- Supabase gratuit se met en pause après une semaine sans activité, ce qui coupe le site en période creuse.
- Les règles de sécurité fournies sont un texte type : à faire valider par la fédération de chasse du département avant usage.
- L'aperçu et les tests ont été faits sans les fonds de carte IGN (inaccessibles depuis mon environnement) : le cadrage et les débordements sont vérifiés, le rendu avec les vrais fonds est à contrôler sur une impression d'essai.
- L'impression dépend du navigateur (Chrome et Firefox visés), à tester avant une vraie battue.
- Vos battues déjà créées gardent l'ancien texte de sécurité (un bouton remet le texte type). Votre modèle d'impression enregistré garde l'ancienne mise en page (un bouton passe à une carte par traque).

## 10. Où en est votre préparation du dimanche 29/11

Deux traques : Réserve (19 postes) et Route de Mennetou (20 postes, 4 postes mouvants, une zone de rapproché). Pas de traque Centrale ce jour-là. Le rendu carton et fiche est vérifié sur vos données : pas de débordement, une carte par traque.

Reste à faire de votre côté : retyper les quatre lignes de Mennetou en « Poste mouvant », nommer les deux traques, saisir pour chaque véhicule les postes déposés et son conducteur, affecter les chasseurs (2 enregistrés pour 39 postes), supprimer les 18 prélèvements d'essai, relire les règles de sécurité, faire une impression d'essai.

## 11. Pistes non réalisées

Bilan de saison et export CSV avec numéro de bracelet, lien en lecture seule pour les invités, secteur de tir par poste, logo converti en tracés pour impression nette, maintien en éveil du projet Supabase.
