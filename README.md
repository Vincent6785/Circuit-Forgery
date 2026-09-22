# Circuit Forgery

**Circuit Forgery** est un planificateur de trajets moto, auto-hébergé et
100 % local, dédié à la France. Son réglage par défaut : ne proposer que des
routes dont la limite de vitesse signalée ne dépasse pas 80 km/h — un seuil
personnalisable ou désactivable depuis l'interface (voir
[Fonctionnalités](#fonctionnalités)). Le calcul d'itinéraire s'appuie sur
les données routières OpenStreetMap via une instance GraphHopper
auto-hébergée — aucun service tiers de routage n'est utilisé, aucune donnée
ne sort de l'infrastructure locale.

Le déploiement est pensé pour tourner sur une seule machine (ou un NAS/mini
serveur) du réseau domestique et être utilisé depuis n'importe quel appareil
du même réseau local — pas d'exposition à Internet, pas de compte, pas de
service cloud.

Code sous licence [MIT](LICENSE). Voir [LICENSE-DATA.md](LICENSE-DATA.md)
pour la licence des données OpenStreetMap utilisées et les conditions
d'attribution — distincte de la licence du code.

## Sommaire

- [Fonctionnalités](#fonctionnalités)
- [Architecture](#architecture)
- [Démarrage](#démarrage)
- [Configuration](#configuration)
- [Vérifier que le filtrage fonctionne](#vérifier-que-le-filtrage-fonctionne)
- [Tests](#tests)
- [Maintenance des données OSM](#maintenance-des-données-osm)
- [Points de vigilance](#points-de-vigilance)
- [État des vérifications](#état-des-vérifications)

## Fonctionnalités

### Construire un trajet

- **Tactile et mobile** : glisser le tracé et dessiner une zone à éviter
  fonctionnent au doigt comme à la souris ; sur petit écran, le panneau se
  replie ("Agrandir la carte") pour laisser toute la hauteur à la carte. Un
  indicateur signale les calculs en cours.
- **Interface en onglets** : *Itinéraire* (trajet A → B et ses étapes),
  *Boucle* (circuit généré) et *Mes trajets* (trajets sauvegardés, points
  d'intérêt). Les options (limite de vitesse, zones à éviter, repliées
  derrière un résumé d'une ligne) et la liste des points sont partagées
  entre Itinéraire et Boucle ; le résumé du trajet (distance, durée,
  sauvegarde) reste visible en bas de la sidebar quel que soit l'onglet.
- **Départ, arrivée, étapes** : champs *Départ* (A) et *Arrivée* (B) avec
  recherche d'adresse, plus un champ *Ajouter une étape*. Sur la carte, un
  clic pose le départ, puis l'arrivée, puis insère chaque nouveau point
  comme étape là où il allonge le moins le trajet — l'arrivée reste
  l'arrivée ; Maj + clic prolonge au contraire le trajet (le point devient
  la nouvelle arrivée). L'itinéraire (filtré > 80 km/h) est recalculé
  automatiquement à chaque changement.
- **Édition des waypoints** : marqueurs A, B et étapes numérotées,
  déplaçables par glisser-déposer ; suppression par clic droit sur un
  marqueur — appui long au doigt — (ou sélection + touche Suppr) ; insertion
  d'une étape en glissant
  le tracé (une poignée apparaît au survol, avec la vitesse du tronçon).
  Liste réordonnable dans la sidebar (glisser-déposer ou boutons ▲▼,
  utilisables au clavier/tactile), avec suppression d'un point précis.
  Chaque point est aussi
  **éditable finement** (clic sur son libellé dans la liste) : renommage et
  coordonnées exactes (lat/lon), avec la distance depuis l'étape précédente
  affichée à côté.
- **Annuler / rétablir** : boutons dédiés ou Ctrl+Z / Ctrl+Maj+Z, sur un
  historique unique couvrant aussi bien les mutations de waypoints que
  l'ajout/retrait d'une zone à éviter.
- **Fermer la boucle** (ajoute le point de départ en fin de trajet) et
  **Inverser le sens** pour finaliser un trajet construit manuellement.

### Génération automatique

- **Circuit en boucle** : distance cible + un clic sur la carte comme point
  de départ génère une boucle fermée (algorithme `round_trip` de
  GraphHopper), reprise ensuite comme des waypoints normaux et donc
  éditable avec les outils ci-dessus. Bouton "Autre variante" pour obtenir
  une forme différente à distance équivalente. Le mode "clic pour générer"
  se quitte sans rien créer via Échap ou le lien "Annuler" affiché pendant
  l'attente. Quand le tracé généré est trop dense pour tenir dans la limite
  de waypoints, un bandeau signale que la boucle affichée est une version
  simplifiée du tracé réel calculé par GraphHopper. Des **points de passage**
  optionnels ("📍 Points de passage" puis clics sur la carte — le mode reste
  actif pour en enchaîner plusieurs, Échap ou "Terminer" en sort) forcent le
  circuit généré à traverser ces endroits en plus du point de départ, qui est
  aussi le point d'arrivée. Ils sont listés dans la sidebar et retirables un
  par un ou d'un coup. GraphHopper n'acceptant qu'un seul point pour
  `round_trip`, ces points sont envoyés au backend (`via_points`), qui les
  insère dans la séquence de waypoints du circuit obtenu (chacun à
  l'emplacement qui minimise le détour) avant que le tracé ne soit routé
  normalement ; la distance affichée n'est alors plus garantie de coller
  précisément à la distance cible. Le backend réserve autant d'emplacements
  que de points de passage sous `CF_MAX_WAYPOINTS` en échantillonnant le
  circuit d'autant moins finement, pour que le recalcul qui suit ne bute pas
  sur cette limite.
- **Véhicule électrique** (options du trajet) : une case bascule le trajet en
  électrique. Trois réglages — autonomie à batterie pleine, distance entre
  deux recharges (20 km par défaut) et vitesse de recharge exprimée en temps
  pour regagner 1 % de batterie (1 min 30 par défaut). Le tracé est alors
  recalculé pour **passer par des bornes réelles**, issues de la
  [Base nationale des IRVE](https://www.data.gouv.fr/datasets/base-nationale-des-irve-data-gouv-infrastructures-de-recharge-pour-vehicules-electriques-donnees-statiques/)
  publiée sur data.gouv.fr sous Licence Ouverte. Les arrêts apparaissent sur
  la carte (pastilles ⚡ numérotées) et dans un panneau qui donne, pour
  chacun, la borne retenue, sa puissance et la durée de recharge. Vaut
  aussi bien pour un itinéraire A → B que pour un circuit en boucle généré.
  - Le pourcentage rechargé à chaque arrêt n'est pas saisi : parcourir
    l'intervalle demandé sur l'autonomie déclarée consomme exactement cette
    fraction de batterie (20 km sur 100 km d'autonomie = 20 %), et la durée
    s'en déduit (20 × 1 min 30 = 30 min par arrêt).
  - Les arrêts recharge **ne sont pas des points du trajet** : la liste des
    points reste celle de l'utilisateur, éditable comme d'habitude. Le
    backend les intercale pour le calcul et les renvoie à part.
  - Un arrêt inutile n'est pas placé : si la charge précédente suffit à
    atteindre l'arrivée, il est supprimé. À l'inverse, une recharge due sans
    borne à proximité (jusqu'à 20 km) est signalée plutôt que passée sous
    silence, tout comme le plus long tronçon réellement parcouru sans
    recharge — chaque détour par une borne rallonge le trajet, l'intervalle
    demandé n'est donc pas tenu au mètre près.
  - Les bornes lues sont mises en cache en base (une semaine) : seul le
    premier trajet traversant une zone interroge data.gouv. Si le service est
    indisponible, l'itinéraire est renvoyé sans arrêt recharge, avec un
    message le disant — une panne de la base des bornes ne prive pas de
    l'itinéraire.
  - **Export GPX** : les arrêts sortent en `<wpt>` (repères), avec le nom de
    la borne, sa puissance, le nombre de points de charge, le pourcentage et
    la durée de recharge, et la distance depuis le départ. Pas en `<rtept>` —
    ce ne sont pas des points du trajet, et les y mettre les transformerait en
    étapes de l'utilisateur au réimport. Le tracé exporté (`<trk>`) passe déjà
    par les bornes. Un trajet sauvegardé conserve ses arrêts, pour que son
    export décrive bien les bornes par lesquelles passe la géométrie
    enregistrée plutôt que celles d'un recalcul ultérieur.
  - La source publie parfois un identifiant technique en guise de nom de
    station (`Réseau eborn/1ef35a80-ba8c-57bd-…`) : le suffixe opaque est
    retiré à la lecture, pour que le GPS affiche `Réseau eborn`.
- **Itinéraires alternatifs** : pour un trajet à exactement 2 points
  (départ/arrivée), jusqu'à 3 tracés distincts proposés au choix.
  Désactivé tant qu'une zone à éviter ou une limite de vitesse
  personnalisée est active (voir [Limitations connues](#limitations-connues)) ;
  "Aucune limite" seule reste compatible.

### Contraintes de trajet

- **Zones à éviter** : mode dédié pour dessiner un cercle (glisser sur la
  carte = centre puis rayon) que le calcul d'itinéraire doit contourner —
  le filtre anti-80 km/h reste actif en plus de cette contrainte. Un champ
  "Rayon (m)" optionnel permet de poser une zone d'un rayon précis par
  simple tap/clic, en complément du réglage visuel au glisser. Les zones
  actives sont listées, retirables individuellement, et persistées avec un
  trajet sauvegardé.
- **Limite de vitesse personnalisable** : le seuil de 80 km/h peut être
  abaissé (20 à 80 km/h) depuis le panneau "Limite de vitesse", ou
  entièrement désactivé via la case "Aucune limite". Recalcule
  automatiquement le trajet en cours, et se sauvegarde avec un trajet
  comme les zones à éviter. Voir
  [Limitations connues](#limitations-connues) pour ce qui n'est
  volontairement pas possible (relever le seuil au-dessus de 80 à une
  valeur précise).

### Sauvegarde et partage

- **Sauvegarde / édition** : un trajet calculé peut être nommé (puis
  renommé en mode modification), annoté
  (champ description libre) et sauvegardé ; un trajet déjà sauvegardé se
  rouvre en édition ("Modifier" → mutation → "Enregistrer les
  modifications", distinct d'une nouvelle création) ou se **duplique**
  ("Dupliquer" charge une copie indépendante, nom pré-rempli "Copie de …",
  sans toucher à l'original).
- **Brouillon persistant** : le trajet en cours de construction est
  automatiquement sauvegardé en local (`localStorage`) et restauré si la
  page est rechargée par accident.
- **Import / export GPX** : export au format GPX d'un trajet sauvegardé
  (depuis la liste) ou du trajet affiché, même non sauvegardé (bouton
  "Exporter en GPX", le nom saisi sert de nom de fichier) ;
  import d'un fichier GPX externe — les waypoints sont **extraits puis
  recalculés** par le moteur de routage (pas de rejeu tel quel), pour que
  le filtre anti-80 km/h s'applique toujours, même à un trajet importé.

### Autour de la carte

- **Recherche d'adresse** : géocodage via Nominatim (OpenStreetMap) dans
  les champs Départ, Arrivée et Étape, suggestions navigables au clavier
  (↑ ↓ Entrée Échap).
- **Points d'intérêt** : ajout par clic droit sur la carte (nom, catégorie,
  notes), icônes par catégorie, liste dédiée dans la sidebar, suppression
  avec confirmation.

### Limitations connues

Ces limites sont vérifiées et documentées, pas des oublis :

- **Pas de profil altimétrique/dénivelé** — l'instance GraphHopper n'a pas
  l'élévation activée (`"elevation": false`), ce qui nécessiterait un
  réimport complet avec données SRTM.
- **Alternatives limitées à 2 points** — GraphHopper `alternative_route`
  n'a de sens visuel clair que pour un trajet départ/arrivée simple, pas
  pour un trajet à étapes. Elles sont aussi désactivées dès qu'une zone à
  éviter ou un seuil de vitesse personnalisé est actif : vérifié
  empiriquement que GraphHopper ignore silencieusement
  `algorithm=alternative_route` dès qu'un `custom_model` (nécessaire pour
  exclure une zone ou resserrer le seuil) est présent dans la requête —
  combiner les deux renverrait un unique tracé présenté à tort comme
  "alternatives". "Aucune limite" reste compatible : c'est un simple
  changement de profil, pas un `custom_model` par requête.
- **Le seuil de vitesse ne peut être qu'abaissé, pas relevé à une valeur
  précise** — un `custom_model` envoyé par requête se fusionne avec celui
  du profil de base mais ne peut jamais l'annuler (`multiply_by: 0` reste
  à 0 quoi que la requête ajoute par-dessus ; vérifié empiriquement : un
  trajet forcé à emprunter le Pont de Normandie, exclu par `max_speed > 80`,
  reste à 91 km de détour même avec un custom_model qui tente explicitement
  de neutraliser cette règle). Relever la limite au-delà de 80 nécessite
  donc un profil GraphHopper distinct, préparé à l'avance et sans cette
  règle (`moto_no_limit`, voir [Architecture](#architecture)) — d'où le
  choix d'un simple bouton "Aucune limite" plutôt que d'accepter n'importe
  quelle valeur au-dessus de 80, ce qui aurait exigé un profil par palier.
  Avec "Aucune limite", les grands axes restent fortement pénalisés (même
  pondération `road_class` que `moto_no_fast`) : ils redeviennent
  utilisables quand ils sont la seule option raisonnable, sans devenir
  l'itinéraire le plus direct pour autant.
- **Zones à éviter absentes du GPX** — aucune représentation standard pour
  ça dans ce format ; seuls les waypoints et le tracé sont exportés/importés.
- **Insertion sur le tracé sans équivalent tactile** — glisser un point sur
  le tracé affiché (`route-insert-interaction.js`) n'a pas d'alternative
  tap/précise, contrairement aux zones à éviter ; aucun appareil tactile
  disponible pour concevoir et vérifier correctement une telle alternative.

## Architecture

Trois services Docker, orchestrés par `docker-compose.yml` :

```
┌──────────────┐        LAN :8000        ┌──────────────────────┐        réseau interne compose        ┌──────────────┐
│  Navigateur   │ ───────────────────────▶ │  backend (FastAPI)   │ ─────────────────────────────────────▶ │ graphhopper  │
│ (Leaflet/JS)  │ ◀─────────────────────── │  + SQLite             │ ◀───────────────────────────────────── │ (routage)    │
└──────────────┘                          └──────────────────────┘                                        └──────────────┘
```

- **`graphhopper/`** — instance GraphHopper auto-hébergée, graphe construit
  à partir de l'extrait OSM France (`data/osm/`). Trois profils : `car`
  (référence, sans caractère moto, préparé en CH) ; `moto_no_fast`
  (`custom_models/moto_no_fast.json`), qui exclut les routes dont la
  vitesse maximale signalée dépasse 80 km/h — le cœur du filtrage, profil
  par défaut ; `moto_no_limit` (`custom_models/moto_no_limit.json`),
  identique à `moto_no_fast` mais sans cette exclusion, utilisé quand
  l'utilisateur désactive la limite depuis l'UI. `moto_no_fast` et
  `moto_no_limit` sont préparés en LM (pas CH), ce qui permet de leur
  envoyer un `custom_model` par requête (zones à éviter, seuil de vitesse
  personnalisé) sans reconstruire le graphe. GraphHopper n'est **jamais**
  exposé au réseau local : le port publié (8989) est lié à `127.0.0.1`
  uniquement ; le backend l'atteint via le réseau interne docker-compose.
- **`backend/`** — API FastAPI qui sert de proxy/enrichissement vers
  GraphHopper (calcul d'itinéraire, alternatives, circuits en boucle,
  zones à éviter, seuil de vitesse personnalisé, import/export GPX,
  géocodage via Nominatim) et persiste trajets/POI dans SQLite. Sert aussi
  le frontend buildé (fichiers statiques) — un seul port exposé au LAN.
- **`frontend/`** — application vanille JS (pas de framework), carte
  Leaflet, buildée avec Vite et servie par le backend en production.

## Démarrage

Prérequis : Docker + le plugin `docker compose`.

```bash
./scripts/download-osm-data.sh   # télécharge data/osm/france-latest.osm.pbf (~4,7 Go)
docker compose build             # construit l'image GraphHopper et l'image backend (inclut le build du frontend)
docker compose up -d             # démarre les deux services
```

`docker compose up -d` suffit : un healthcheck Docker sur GraphHopper
(endpoint `/healthcheck` du port admin Dropwizard) fait attendre le
démarrage du backend jusqu'à ce que le graphe soit effectivement chargé
(`depends_on: condition: service_healthy`). Le tout premier import à froid
reste long (5 à 60 minutes selon la machine) ; suivre la progression avec
`docker compose logs -f graphhopper` ou `docker compose ps` (colonne
`STATUS`, passe de `starting` à `healthy`) reste possible mais n'est pas
nécessaire pour enchaîner les commandes.

L'application est alors accessible sur `http://localhost:8000` et, depuis
toute autre machine du même réseau local, sur
`http://<IP-LAN-de-la-machine>:8000` (trouver l'IP avec `ip -4 addr show`).
GraphHopper (port 8989) n'est publié que sur `127.0.0.1` : il n'est
joignable ni depuis le LAN ni depuis l'extérieur, seul le backend proxy
l'est.

Les deux conteneurs s'exécutent sans privilèges root. Leur script de
démarrage remet d'abord à l'utilisateur dédié (`app`, UID 1000, pour le
backend ; `graphhopper`, UID 10001) la propriété des données créées par une
version antérieure qui tournait en root (`./backend/data`, volume
`graph-cache`), puis abandonne ces privilèges — une installation existante
se met donc à jour sans manipulation. Si l'utilisateur de l'hôte
propriétaire de `./backend/data` n'a pas l'UID 1000, construire l'image
backend avec `--build-arg APP_UID=<uid> --build-arg APP_GID=<gid>`.

### Images publiées

`.github/workflows/publish-docker.yml` construit et publie automatiquement
les images `backend` et `graphhopper` sur GitHub Container Registry à
chaque mise à jour de `main` (tags `latest` et `<sha du commit>`) et à
chaque tag de version `vX.Y.Z` (tags `X.Y.Z` et `X.Y`), avec attestation de
provenance et SBOM (voir [CHANGELOG.md](CHANGELOG.md)) :

```
ghcr.io/vincent6785/circuit-forgery-backend:latest
ghcr.io/vincent6785/circuit-forgery-graphhopper:latest
```

`docker pull` sur ces images évite de construire depuis les sources, mais
ne dispense pas du reste de la configuration au runtime : les images
n'embarquent ni les données OSM, ni `graphhopper/config.yml`, ni les
custom models — ce sont toujours des volumes montés (voir
`docker-compose.yml`). `docker-compose.images.yml` surcharge uniquement
`image:` sur les deux services (hérite du reste — volumes, ports,
healthchecks — de `docker-compose.yml`) pour utiliser les images publiées
au lieu de builder localement :

```bash
git clone https://github.com/Vincent6785/Circuit-Forgery.git
cd Circuit-Forgery
./scripts/download-osm-data.sh   # toujours nécessaire, cf. Démarrage
docker compose -f docker-compose.yml -f docker-compose.images.yml pull
docker compose -f docker-compose.yml -f docker-compose.images.yml up -d
```

Cloner le dépôt reste la façon la plus simple d'obtenir
`graphhopper/config.yml` et les custom models ; ce sont des fichiers texte
légers (pas de gros binaire versionné), le clone n'a rien de coûteux en soi
— seules les données OSM (téléchargées à part) sont volumineuses.

**⚠️ Ce démarrage rapide reproduit le même service que "Démarrage"
ci-dessus : sans authentification, pensé pour un réseau local de confiance.**
`docker-compose.yml` publie le port backend sur `0.0.0.0:8000` (toutes les
interfaces), donc quiconque atteint ce port en lecture/écriture accède à
tous les trajets et POI, sans compte ni mot de passe. Ne pas lancer cette
stack telle quelle sur une machine directement joignable depuis Internet
(VM cloud, port forwarding) sans ajouter sa propre authentification
(reverse proxy, VPN...) devant.

Attention aussi au pare-feu de l'hôte : les ports publiés par Docker
contournent les règles `ufw`/`firewalld` (Docker insère ses propres règles
iptables). Pour restreindre l'accès au backend, limiter la publication du
port dans `docker-compose.yml` — par exemple `"127.0.0.1:8000:8000"` derrière
un reverse proxy — plutôt que de compter sur le pare-feu. Voir
[SECURITY.md](SECURITY.md) pour signaler une vulnérabilité.

## Configuration

Le backend se configure par variables d'environnement, préfixées `CF_`
(voir `backend/app/core/config.py` pour la liste faisant foi). Les valeurs
par défaut conviennent à un usage local standard ; les plus utiles à
ajuster :

| Variable | Défaut | Rôle |
|---|---|---|
| `CF_GRAPHHOPPER_URL` | `http://graphhopper:8989` | URL interne de l'instance GraphHopper (déjà fixée par `docker-compose.yml`) |
| `CF_GRAPHHOPPER_NO_LIMIT_PROFILE` | `moto_no_limit` | Profil GraphHopper utilisé pour "Aucune limite" (voir Architecture) |
| `CF_DATABASE_PATH` | `/data/circuit-forgery.db` | Chemin du fichier SQLite (monté sur `./backend/data`) |
| `CF_MAX_WAYPOINTS` | `100` | Nombre maximal de points par trajet (protège la complexité des requêtes GraphHopper) |
| `CF_MAX_AVOID_ZONES` | `20` | Nombre maximal de zones à éviter par trajet |
| `CF_MAX_ROUND_TRIP_DISTANCE_M` | `500000` | Distance cible maximale pour un circuit en boucle généré |
| `CF_MAX_ROUND_TRIP_VIA_POINTS` | `20` | Nombre maximal de points de passage imposés à un circuit en boucle |
| `CF_IRVE_API_URL` | API tabulaire data.gouv | Source des bornes de recharge (Base nationale des IRVE) |
| `CF_IRVE_SEARCH_RADIUS_M` | `5000` | Rayon de recherche d'une borne autour du point où la recharge est due |
| `CF_IRVE_MAX_DETOUR_M` | `20000` | Rayon élargi quand aucune borne n'est trouvée dans le rayon normal |
| `CF_IRVE_CACHE_TTL_S` | `604800` | Durée de validité du cache local des bornes (7 jours) |
| `CF_IRVE_CACHE_CELL_DEG` | `0.05` | Pas minimal de la grille de cache des bornes, en degrés |
| `CF_IRVE_MAX_ROWS_PER_CELL` | `1000` | Lignes lues au maximum par cellule (l'API plafonne les pages à 200) |
| `CF_MAX_CHARGING_STOPS` | `50` | Nombre maximal d'arrêts recharge insérés dans un trajet |
| `CF_MAX_AVOID_ZONE_RADIUS_M` | `20000` | Rayon maximal d'une zone à éviter |
| `CF_MAX_GPX_UPLOAD_BYTES` | `5000000` | Taille maximale d'un fichier GPX importé |
| `CF_MAX_REQUEST_BODY_BYTES` | `10000000` | Taille maximale d'un corps de requête, refusée en 413 avant sa lecture complète |
| `CF_LOG_LEVEL` | `INFO` | Niveau des journaux du backend (`DEBUG`, `INFO`, `WARNING`, `ERROR`, `CRITICAL`) |
| `CF_NOMINATIM_URL` | `https://nominatim.openstreetmap.org` | Serveur Nominatim utilisé pour la recherche d'adresse |
| `CF_TILE_URL` | `https://tile.openstreetmap.org/{z}/{x}/{y}.png` | Serveur de tuiles du fond de carte (autorisé automatiquement par la Content-Security-Policy) |
| `CF_TILE_ATTRIBUTION` | `&copy; OpenStreetMap contributors` | Attribution affichée pour ce fond de carte |

Sondes de santé du backend : `/api/health/live` (le serveur répond, utilisée
par le healthcheck Docker), `/api/health/ready` (503 tant que GraphHopper ou
la base ne répondent pas) et `/api/health` (état détaillé, toujours 200).

La heap JVM de GraphHopper se règle séparément via `JAVA_OPTS` dans
`docker-compose.yml` (service `graphhopper`) — voir
[Dépannage import (RAM)](#points-de-vigilance).

## Vérifier que le filtrage fonctionne

```bash
./scripts/smoke-test-routing.sh
```

Ce script échoue si un trajet calculé par le profil `moto_no_fast` contient
un segment avec une limite de vitesse signalée > 80 km/h.

## Tests

### End-to-end (Playwright)

Nécessite la stack Docker démarrée **avec l'override de test**, qui
construit le frontend avec les accès internes utilisés par les tests
(`window.__map`…) — absents des images de production. La suite pilote
ensuite un vrai navigateur contre l'application réelle (frontend + backend +
GraphHopper), sans mocks (à une exception près, documentée ci-dessous).
Avant chaque run, `tests/e2e/global-setup.js` supprime les données de test
laissées par un run précédent interrompu (trajets « Playwright… », points
d'intérêt de test), pour que les suites repartent d'une base propre.

```bash
docker compose -f docker-compose.yml -f docker-compose.e2e.yml up -d --build
```

```bash
cd frontend
npm install
npx playwright install --with-deps chromium   # une seule fois
npm run test:e2e
```

L'image de test porte son propre nom (`circuit-forgery-backend:e2e`) : pour
revenir ensuite à l'image de production, relancer `docker compose up -d
--build` sans l'override.

`--with-deps` installe aussi les bibliothèques système nécessaires au
navigateur headless ; le script est pensé pour Debian/Ubuntu et peut
échouer sur Arch Linux (ou toute distro non supportée) — dans ce cas,
retirer `--with-deps`, lancer `npx playwright install chromium` seul, puis
installer manuellement les dépendances système manquantes indiquées par
l'erreur au premier `npm run test:e2e` (`sudo pacman -S ...` ou équivalent).

Suites dans `frontend/tests/e2e/` (une par fonctionnalité) : navigation et
sauvegarde d'un trajet, édition des waypoints, précision (renommage,
coordonnées), annuler/rétablir, circuits en boucle, zones à éviter, limite
de vitesse, alternatives, duplication, import/export GPX, points d'intérêt,
recherche d'adresse, brouillon persistant, gestion des erreurs de routage,
itinéraire A → B (marqueurs, glisser-déposer sur la carte, onglets).
`address-search.spec.js` mocke `/api/geocode` — seule exception à la règle
"pas de mocks", Nominatim étant un service tiers à rate-limit strict.

### Tests unitaires frontend

```bash
cd frontend
npm install
npm test
```

Vitest, sans navigateur ni backend, sur la logique pure extraite de
l'interface : règle d'insertion des étapes, champs Départ/Arrivée,
découpage et survol du tracé, onglets, résumé des options. Exécutés en CI
avec le lint.

### Lint frontend

```bash
cd frontend
npm run lint
```

ESLint (configuration plate minimale, `eslint:recommended`) sur
`frontend/src`.

### Backend (pytest)

Tests unitaires/intégration sur la logique pure (parsing/génération GPX,
validation des waypoints, calcul des `leg_boundaries`, throttling/cache du
client Nominatim) et quelques tests d'intégration via `TestClient` FastAPI
(base SQLite en mémoire, pas de dépendance à GraphHopper) — plus rapides et
plus ciblés que la suite Playwright pour ces cas-là.

```bash
cd backend
docker run --rm -v "$PWD":/app -w /app python:3.12-slim \
  bash -c "pip install -q --require-hashes --no-deps -r requirements.lock \
    && pip install -q -r requirements-dev.txt && python -m pytest -q"
```

Passer par Docker plutôt qu'un virtualenv local garantit la même version de
Python que l'image de production (`backend/Dockerfile`), indépendamment de
la version de `python3` installée sur la machine hôte (`pydantic-core` n'a
par exemple pas encore de wheel pour Python 3.14 au moment de l'écriture).
Un virtualenv local fonctionne aussi tant que `python3` pointe vers une
version ≤ 3.13 :

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m pytest
```

Les dépendances de production sont figées, dépendances transitives et
hashes compris, dans `requirements.lock`, installé par l'image Docker avec
`pip install --require-hashes`. Après toute modification de
`requirements.txt`, le régénérer (la CI vérifie qu'il est à jour) :

```bash
cd backend
uvx --from uv uv pip compile requirements.txt --generate-hashes \
  --python-version 3.12 --python-platform x86_64-manylinux_2_28 --no-header -o requirements.lock
```

## Maintenance des données OSM

```bash
./scripts/update-osm-data.sh
```

Pas d'automatisation en cron : l'import complet de la France consomme
beaucoup de RAM et prend plusieurs minutes, mieux vaut le déclencher
consciemment.

Le nouvel extrait est téléchargé (avec reprise en cas de coupure) et vérifié
avant l'arrêt de GraphHopper : l'interruption de service se limite au
réimport, et un téléchargement en échec laisse l'extrait et le service en
place. L'extrait précédent est conservé
(`data/osm/france-latest.osm.pbf.previous`), et la date des données
importées est consignée dans `data/osm/france-latest.osm.pbf.info`
(attribution ODbL). Avec les images publiées :
`COMPOSE_FILES="-f docker-compose.yml -f docker-compose.images.yml" ./scripts/update-osm-data.sh`.

## Points de vigilance

### Modifier ou ajouter un profil nécessite un réimport complet

GraphHopper marque les sous-réseaux non connectés
(`PrepareRoutingSubnetworks`) et prépare les landmarks (LM) **pour la
formule de pondération exacte du custom model au moment de l'import**, et
persiste ce marquage dans `graph-cache`. Modifier
`graphhopper/custom_models/moto_no_fast.json` sans reconstruire le graphe
peut laisser GraphHopper utiliser un graphe dont la connectivité a été
calculée pour l'ancienne version du modèle.

**Vérifié empiriquement en ajoutant le profil `moto_no_limit`** : ce n'est
pas propre à la modification d'un profil existant — *ajouter* un profil à
`config.yml` sans reconstruire échoue tout aussi sec, GraphHopper refusant
carrément de démarrer :
```
java.lang.IllegalStateException: Profiles do not match:
Graphhopper config: car|...,moto_no_fast|...,moto_no_limit|...
Graph: car|...,moto_no_fast|...
Change configuration to match the graph or delete /graph-cache/
```
Le conteneur part alors en boucle de redémarrage jusqu'à ce que la
configuration soit alignée avec le graphe déjà importé. Après toute
modification ou ajout de profil :

```bash
docker compose down
docker volume rm circuit-forgery_graph-cache
docker compose up -d graphhopper
```

**Deux pièges rencontrés en développement**, tous deux visibles dans les
logs `PrepareRoutingSubnetworks` à l'import (nombre de composantes
connectées) :

1. Une exclusion dure (`multiply_by: 0`) sur
   `road_class == MOTORWAY || TRUNK` fragmentait le graphe France en 969
   composantes déconnectées (au lieu d'un seul réseau), car certaines
   routes nationales taguées `TRUNK` sont l'unique liaison viable entre
   deux régions, même à vitesse ≤ 80 km/h. `road_class` ne sert donc plus
   qu'à **pénaliser fortement** (jamais exclure) MOTORWAY/TRUNK/PRIMARY.
2. Après correction du point 1, la fragmentation persistait quasi à
   l'identique (968 composantes). Cause réelle : GraphHopper encode un
   `max_speed` absent de tag OSM comme **+infini**
   (`use_maximum_as_infinity`) — très fréquent sur les petites routes
   rurales/communales françaises, qui n'ont souvent aucun tag `maxspeed`
   explicite. La condition `max_speed > 80` excluait donc aussi *toutes*
   les routes sans limite affichée. Le modèle final utilise
   `max_speed > 80 && max_speed < 1000` pour ne cibler que les vitesses
   *réellement connues et élevées* ; les routes sans tag retombent sur les
   règles `road_class` (unclassified/residential/tertiary → priorisées).
   Après ce correctif : 69 composantes, la plus grande couvrant l'essentiel
   du réseau routable (comparable au profil `car` de référence).

Le modèle final n'a donc qu'**une seule exclusion dure** : `max_speed`
connu et `> 80` — exactement l'exigence de l'utilisateur, ni plus ni moins.

### Erreurs de calcul d'itinéraire (point hors réseau routier)

Cliquer un point sans route à proximité (en mer, zone très isolée) fait
répondre GraphHopper en **HTTP 400** (`PointNotFoundException` ou
`ConnectionNotFoundException`). `backend/app/services/graphhopper_client.py`
distingue ce cas (entrée utilisateur, GraphHopper a bien répondu) d'une
vraie panne GraphHopper (erreur réseau/5xx) :

- point/connexion non trouvé → `GraphHopperRouteNotFoundError` → **422**
  côté API, message français affiché dans un bandeau inline (`#route-error`)
  côté frontend.
- GraphHopper injoignable → `GraphHopperUnavailableError` → **503**.

Avant ce correctif, les deux cas remontaient en 502 et le frontend
affichait une popup `alert()` bloquante — repéré via les logs
(`docker compose logs backend`, requêtes `502 Bad Gateway` corrélées à des
`PointNotFoundException` GraphHopper au même timestamp). Couvert en
régression par `frontend/tests/e2e/route-error-handling.spec.js`.

### Dépannage import (RAM)

`JAVA_OPTS` dans `docker-compose.yml` (service `graphhopper`) contrôle la
heap JVM (`-Xmx`, 16 Go par défaut, même valeur que l'image). Prévoir
8-16 Go pour la France entière ; augmenter si `OutOfMemoryError` pendant
l'import. `-XX:+ExitOnOutOfMemoryError` arrête la JVM au premier manque de
mémoire (le conteneur redémarre alors) plutôt que de la laisser à moitié
fonctionnelle. La JVM consomme aussi de la mémoire hors heap : garder une
marge de quelques Go sur la machine.

## État des vérifications

Vérifié de bout en bout via l'API (curl), SQLite direct et Playwright
(navigateur headless réel) : import GraphHopper France entière, filtrage
`moto_no_fast` (smoke test), calcul d'itinéraire via le backend, CRUD
complet trajets et POI, persistance après redémarrage du conteneur
backend, accessibilité LAN du backend (`ss -tlnp` + requête depuis l'IP LAN
de la machine), non-exposition de GraphHopper hors loopback, et parcours
utilisateur complet dans un vrai navigateur (clic carte → calcul →
sauvegarde → rechargement, y compris les cas d'erreur de routage). Limite
de vitesse personnalisable vérifiée contre un cas réel concret (Pont de
Normandie, `max_speed > 80` donc exclu par défaut) : 91 km de détour par
défaut, ~70 km avec "Aucune limite" une fois le profil `moto_no_limit`
importé et vérifié fonctionnel. Points de passage du circuit en boucle
vérifiés après confirmation empirique que `algorithm=round_trip` rejette
tout appel avec plus d'un point ("For round trip calculation exactly one
point is required") — d'où l'insertion après coup dans la séquence de
waypoints plutôt qu'un envoi direct à GraphHopper. Le passage effectif du
tracé par chaque étape d'un itinéraire classique a été vérifié contre
l'instance réelle (calcul à 3 points : chaque point demandé se retrouve dans
la géométrie renvoyée, à la distance d'accrochage au réseau routier près, et
les bornes de legs tombent bien dessus).

Mode électrique vérifié contre l'instance réelle et la vraie base IRVE :
Lyon → Grenoble (125 km, autonomie 100 km, recharge tous les 20 km) produit
cinq arrêts à des bornes existantes, espacés de 20 à 23 km, pour 2 h 30 de
recharge cumulée — l'écart à l'intervalle demandé vient des détours par les
bornes, et est renvoyé au client (`charging_max_gap_m`). Le premier calcul
dans une zone inconnue prend environ une seconde (appels à data.gouv menés de
front), les suivants sont immédiats grâce au cache en base.

**Non vérifié dans cet environnement** : l'accès depuis un second appareil
physique du LAN (un seul appareil disponible pour les vérifications) —
seule l'accessibilité réseau (port en écoute sur l'IP LAN) a été confirmée.
