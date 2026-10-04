# HOTEL — plateau 3D

Reproduction jouable dans le navigateur du jeu de société **HOTEL** (Lansay 2023,
réf. 75021), en 3D temps réel avec Three.js. Les règles, les prix et les noms des
huit complexes hôteliers sont repris de la notice officielle
[`75021_NOTICE_RC 2023.pdf`](75021_NOTICE_RC%202023.pdf) fournie dans ce dossier.

2 à 4 joueurs, en « hot-seat » sur le même écran.

## Lancer le jeu

Les modules ES et la carte d'imports imposent un vrai serveur HTTP ; ouvrir
`index.html` directement depuis le disque ne fonctionne pas.

```sh
python -m http.server 8000
# puis http://localhost:8000/
```

Three.js est chargé depuis jsDelivr : une connexion réseau est nécessaire au
premier chargement.

## Ce qui est implémenté

| Règle (notice) | Statut |
| --- | --- |
| Dotation 12 000 à 4 joueurs / 16 000 à 2-3 (p.3) | oui |
| Dé « classique », un 6 fait rejouer (p.3) | oui |
| Deux voitures jamais sur la même case (p.3) | oui |
| Achat de terrain bordant la case, 1 par tour (p.3) | oui |
| Rachat de terrain à moitié prix, irrefusable, pas d'hôtel bâti (p.3) | oui |
| Permis de construire + dé « permis » : ROUGE / VERT / H / ×2 (p.4) | oui |
| Ordre de construction imposé, plusieurs hôtels sur un seul terrain (p.4) | oui |
| Construction obligatoire si le permis est délivré (p.4) | oui |
| Ligne rouge de la Banque : +2 000, suspendu à 2 joueurs restants (p.4) | oui |
| Ligne jaune de la Mairie : 1 entrée par hôtel et par annexe, par tour (p.4) | oui |
| Entrées : hôtel principal requis, cases grisées interdites, 1 par case (p.5) | oui |
| Cases « Entrée gratuite » et « Construction gratuite » (p.5) | oui |
| Base de loisirs : complexe achevé, sans permis, à tout moment (p.5) | oui |
| Séjour = prix de la nuitée × dé (1 à 6 nuits) (p.5) | oui |
| Enchères : complexe entier, sans minimum, rasé si personne n'enchérit (p.6) | oui |
| Banqueroute et dernier joueur en jeu (p.6) | oui |

## Habillage : d'où viennent les couleurs et les formes

Les photos [`Hotel01.jpg`](Hotel01.jpg), [`Hotel02.jpg`](Hotel02.jpg) et
[`Hotel03.jpg`](Hotel03.jpg) servent de référence visuelle. Les teintes ne sont
pas choisies à l'œil : elles sont échantillonnées sur la photo du plateau, puis
remontées en luminosité (les clichés sont sous-exposés et jaunis). Elles sont
rassemblées dans `SKIN`, en haut de [`src/data.js`](src/data.js).

La chaussée est reproduite telle qu'elle se lit sur la photo, en coupe :
liseré bleu ciel · bande noire · case blanche · bande noire · liseré bleu ciel,
les cases étant séparées par un trait rouge qui traverse toute la largeur. La
zone de départ reprend son sol gris et ses quatre emplacements jaune, vert, bleu
et rouge.

Les hôtels reprennent la construction des pièces : un **socle** plastique
débordant, un **corps** en carton imprimé à façade vitrée, un **toit** plastique
débordant surmonté d'un bloc technique — socle et toit partageant la couleur
plastique du complexe.

**Attention : les photos montrent l'édition MB de 1986**, dont les complexes ne
sont pas ceux de la notice Lansay 2023 suivie pour les règles et les prix. Les
moules ont donc été transposés complexe par complexe, en gardant les trois noms
communs aux deux éditions :

| Moule photographié (MB 1986) | Complexe 2023 | Silhouette |
| --- | --- | --- |
| Boomerang | Boomerang Bay | bâtiment en arc, crème |
| Fujiyama | Fujiyama | corps cuivré, toit noir octogonal |
| Waikiki | Waikiki | bungalows bruns, toiture arrondie |
| Safari | Mont Blanc | chalet brun, toit pyramidal |
| l'Étoile | Sahara | bâtiment en arc, rouge à toit noir |
| Taj Mahal | Mirasol | palais ivoire à coupoles |
| Royal | Regency | tour vitrée bleue, socle et toit crème |
| Président | Liberty | gratte-ciel noir fumé, le plus haut |

Le tracé du circuit, lui, n'est **pas** copié : le plateau photographié est un
serpentin, le jeu utilise une boucle de 48 cases (voir ci-dessous).

## Écarts assumés par rapport au jeu physique

- **Plan du plateau.** La notice ne reproduit pas le plateau. Le circuit a donc
  été redessiné : 48 cases en boucle, chacune déclarant les complexes qu'elle
  borde (`BOARD` dans [`src/data.js`](src/data.js)). Les fronts de cases
  respectent le nombre d'hôtels de chaque complexe et l'exemple de la notice
  (une case « Achat de terrain » donne accès à deux terrains voisins).
- **Faces du dé « permis ».** La notice décrit les quatre faces sans dire
  combien de fois chacune apparaît. La répartition retenue est celle des
  éditions classiques : 2 ROUGE, 2 VERT, 1 « H », 1 « ×2 » (`PERMIT_FACES`).
- **Bases de loisirs du Fujiyama et du Boomerang Bay.** Les titres de propriété
  de l'édition 2023/2024 les donnent à 250, ce qui paraît être une coquille
  (rentabilisées en une nuit). La valeur source est conservée par défaut ;
  passer `PATCH_EQUILIBRAGE` à `true` dans `src/data.js` les porte à 2 500.
- **Banque et Mairie.** Posées au centre du plateau plutôt que le long du
  circuit, pour dégager les parcelles. Les lignes rouge et jaune restent, elles,
  en travers de la chaussée aux cases 12 et 36.
- **Tracé du circuit.** Le plateau réel est un serpentin qui s'enroule autour
  des complexes. Ici le circuit est une boucle régulière de 48 cases, aux angles
  arrondis : chaque complexe reçoit une portion de courbe, ses hôtels s'alignent
  le long de son front de cases.
- **Enchères.** Résolues en un tour : chaque adversaire saisit son offre, le plus
  offrant emporte le complexe. Pas d'enchère montante tour par tour.

## Les huit complexes

| Complexe | Hôtels | Terrain | Entrée | Base de loisirs | Nuitée max |
| --- | ---: | ---: | ---: | ---: | ---: |
| Boomerang Bay | 1 | 500 | 100 | 250 | 600 |
| Fujiyama | 3 | 1 000 | 100 | 250 | 400 |
| Sahara | 3 | 1 500 | 100 | 1 000 | 300 |
| Mont Blanc | 3 | 2 000 | 150 | 2 000 | 500 |
| Mirasol | 4 | 2 500 | 200 | 3 000 | 600 |
| Waikiki | 5 | 2 500 | 200 | 2 500 | 1 000 |
| Regency | 5 | 3 000 | 250 | 4 000 | 750 |
| Liberty | 4 | 3 500 | 250 | 5 000 | 1 200 |

Le détail complet de chaque titre de propriété est consultable en jeu : cliquez
un complexe dans la liste de droite ou directement sur le plateau.

## Organisation du code

| Fichier | Rôle |
| --- | --- |
| [`src/data.js`](src/data.js) | Titres de propriété, plan des 48 cases, dés, constantes |
| [`src/engine.js`](src/engine.js) | Moteur de règles pur, sans dépendance 3D, émetteur d'événements |
| [`src/scene.js`](src/scene.js) | Plateau Three.js : circuit, parcelles, voitures, animations |
| [`src/models.js`](src/models.js) | Volumes procéduraux : un style architectural par complexe |
| [`src/dice.js`](src/dice.js) | Les deux dés, en CSS 3D |
| [`src/ui.js`](src/ui.js) | Panneau d'actions contextuel, titres, journal, enchères |
| [`src/main.js`](src/main.js) | Assemblage et écran de configuration |

Le moteur ne connaît ni le DOM ni Three.js : il expose les coups légaux, et
l'interface se contente de les proposer. `window.game` est exposé en console
pour inspecter l'état d'une partie.

## Vérifier le rendu

Le projet n'a pas besoin de Node. Pour contrôler le jeu dans un vrai navigateur
sans quitter la ligne de commande :

```sh
pip install playwright && python -m playwright install chromium
```

Un court script Playwright suffit alors à charger `http://localhost:8000/`,
relever les erreurs de la console, jouer quelques tours et prendre des captures.
`window.game` et `window.view` sont exposés, ce qui permet de forcer un état
(complexes construits, bases de loisirs, position de caméra) avant la capture.

## Commandes

- Clic gauche glissé : faire tourner la caméra · molette : zoom · clic droit : déplacer.
- Clic sur une case en surbrillance : y poser une entrée.
- Clic sur un complexe ou sur une pastille de joueur : afficher son titre de propriété.

---

HOTEL™ est une marque sous licence NPD Partnership Ltd., éditée en France par
Lansay. Ce dépôt est une réalisation personnelle à but non commercial, sans
affiliation avec l'éditeur.
