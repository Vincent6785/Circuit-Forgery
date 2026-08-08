# Circuit Forgery

**Circuit Forgery** est un planificateur de trajets moto, auto-hébergé et
100 % local, dédié à la France. Sa règle de base : ne jamais proposer de
route dont la limite de vitesse signalée dépasse 80 km/h. Le calcul
d'itinéraire s'appuie sur les données routières OpenStreetMap via une
instance GraphHopper auto-hébergée — aucun service tiers de routage n'est
utilisé, aucune donnée ne sort de l'infrastructure locale.

Le déploiement est pensé pour tourner sur une seule machine (ou un NAS/mini
serveur) du réseau domestique et être utilisé depuis n'importe quel appareil
du même réseau local — pas d'exposition à Internet, pas de compte, pas de
service cloud.

> Voir [LICENSE-DATA.md](LICENSE-DATA.md) pour la licence des données
> OpenStreetMap utilisées et les conditions d'attribution.

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

- **Ajout de points** : clic gauche sur la carte pour poser un point de
  départ, une étape ou une arrivée ; l'itinéraire (filtré > 80 km/h) est
  recalculé automatiquement à chaque changement.
- **Édition des waypoints** : liste réordonnable dans la sidebar
  (glisser-déposer ou boutons ▲▼, utilisables au clavier/tactile),
  suppression d'un point précis, sélection d'un marqueur sur la carte +
  touche Suppr, insertion d'un point en glissant directement sur le tracé
  affiché entre deux waypoints existants. Chaque point est aussi
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
  simplifiée du tracé réel calculé par GraphHopper.
- **Itinéraires alternatifs** : pour un trajet à exactement 2 points
  (départ/arrivée), jusqu'à 3 tracés distincts proposés au choix.
  Désactivé tant qu'une zone à éviter est active (voir
  [Limitations connues](#limitations-connues)).

### Contraintes de trajet

- **Zones à éviter** : mode dédié pour dessiner un cercle (glisser sur la
  carte = centre puis rayon) que le calcul d'itinéraire doit contourner —
  le filtre anti-80 km/h reste actif en plus de cette contrainte. Un champ
  "Rayon (m)" optionnel permet de poser une zone d'un rayon précis par
  simple tap/clic, en complément du réglage visuel au glisser. Les zones
  actives sont listées, retirables individuellement, et persistées avec un
  trajet sauvegardé.

### Sauvegarde et partage

- **Sauvegarde / édition** : un trajet calculé peut être nommé, annoté
  (champ description libre) et sauvegardé ; un trajet déjà sauvegardé se
  rouvre en édition ("Modifier" → mutation → "Enregistrer les
  modifications", distinct d'une nouvelle création) ou se **duplique**
  ("Dupliquer" charge une copie indépendante, nom pré-rempli "Copie de …",
  sans toucher à l'original).
- **Brouillon persistant** : le trajet en cours de construction est
  automatiquement sauvegardé en local (`localStorage`) et restauré si la
  page est rechargée par accident.
- **Import / export GPX** : export d'un trajet sauvegardé au format GPX,
  import d'un fichier GPX externe — les waypoints sont **extraits puis
  recalculés** par le moteur de routage (pas de rejeu tel quel), pour que
  le filtre anti-80 km/h s'applique toujours, même à un trajet importé.

### Autour de la carte

- **Recherche d'adresse** : géocodage via Nominatim (OpenStreetMap), un
  clic sur un résultat ajoute le point au trajet.
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
  éviter est active : vérifié empiriquement que GraphHopper ignore
  silencieusement `algorithm=alternative_route` dès que `custom_model`
  (nécessaire pour exclure une zone) est présent dans la requête — combiner
  les deux renverrait un unique tracé présenté à tort comme "alternatives".
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
  à partir de l'extrait OSM France (`data/osm/`). Le profil custom
  `moto_no_fast` (`graphhopper/custom_models/moto_no_fast.json`) exclut les
  routes dont la vitesse maximale signalée dépasse 80 km/h — c'est le cœur
  du filtrage. N'est **jamais** exposé au réseau local : le port publié
  (8989) est lié à `127.0.0.1` uniquement ; le backend l'atteint via le
  réseau interne docker-compose.
- **`backend/`** — API FastAPI qui sert de proxy/enrichissement vers
  GraphHopper (calcul d'itinéraire, alternatives, circuits en boucle,
  zones à éviter, import/export GPX, géocodage via Nominatim) et persiste
  trajets/POI dans SQLite. Sert aussi le frontend buildé (fichiers
  statiques) — un seul port exposé au LAN.
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

## Configuration

Le backend se configure par variables d'environnement, préfixées `CF_`
(voir `backend/app/core/config.py` pour la liste faisant foi). Les valeurs
par défaut conviennent à un usage local standard ; les plus utiles à
ajuster :

| Variable | Défaut | Rôle |
|---|---|---|
| `CF_GRAPHHOPPER_URL` | `http://graphhopper:8989` | URL interne de l'instance GraphHopper (déjà fixée par `docker-compose.yml`) |
| `CF_DATABASE_PATH` | `/data/circuit-forgery.db` | Chemin du fichier SQLite (monté sur `./backend/data`) |
| `CF_MAX_WAYPOINTS` | `20` | Nombre maximal de points par trajet (protège la complexité des requêtes GraphHopper) |
| `CF_MAX_ROUND_TRIP_DISTANCE_M` | `500000` | Distance cible maximale pour un circuit en boucle généré |
| `CF_MAX_AVOID_ZONE_RADIUS_M` | `20000` | Rayon maximal d'une zone à éviter |
| `CF_MAX_GPX_UPLOAD_BYTES` | `5000000` | Taille maximale d'un fichier GPX importé |
| `CF_NOMINATIM_URL` | `https://nominatim.openstreetmap.org` | Serveur Nominatim utilisé pour la recherche d'adresse |

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

Nécessite la stack Docker démarrée (`docker compose up -d`, voir
[Démarrage](#démarrage)) — les tests s'exécutent contre l'application
réelle (frontend + backend + GraphHopper), sans mocks (à une exception
près, documentée ci-dessous).

```bash
cd frontend
npm install
npx playwright install --with-deps chromium   # une seule fois
npm run test:e2e
```

`--with-deps` installe aussi les bibliothèques système nécessaires au
navigateur headless ; le script est pensé pour Debian/Ubuntu et peut
échouer sur Arch Linux (ou toute distro non supportée) — dans ce cas,
retirer `--with-deps`, lancer `npx playwright install chromium` seul, puis
installer manuellement les dépendances système manquantes indiquées par
l'erreur au premier `npm run test:e2e` (`sudo pacman -S ...` ou équivalent).

Suites dans `frontend/tests/e2e/` (une par fonctionnalité) : navigation et
sauvegarde d'un trajet, édition des waypoints, précision (renommage,
coordonnées), annuler/rétablir, circuits en boucle, zones à éviter,
alternatives, duplication, import/export GPX, points d'intérêt, recherche
d'adresse, brouillon persistant, gestion des erreurs de routage.
`address-search.spec.js` mocke `/api/geocode` — seule exception à la règle
"pas de mocks", Nominatim étant un service tiers à rate-limit strict.

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
  bash -c "pip install -q -r requirements-dev.txt && python -m pytest -q"
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

## Maintenance des données OSM

```bash
./scripts/update-osm-data.sh
```

Pas d'automatisation en cron : l'import complet de la France consomme
beaucoup de RAM et prend plusieurs minutes, mieux vaut le déclencher
consciemment.

## Points de vigilance

### Modifier `moto_no_fast.json` nécessite un réimport complet

GraphHopper marque les sous-réseaux non connectés
(`PrepareRoutingSubnetworks`) et prépare les landmarks (LM) **pour la
formule de pondération exacte du custom model au moment de l'import**, et
persiste ce marquage dans `graph-cache`. Modifier
`graphhopper/custom_models/moto_no_fast.json` sans reconstruire le graphe
peut laisser GraphHopper utiliser un graphe dont la connectivité a été
calculée pour l'ancienne version du modèle. Après toute modification de ce
fichier :

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
heap JVM (`-Xmx`). Prévoir 8-16 Go pour la France entière ; augmenter si
`OutOfMemoryError` pendant l'import.

## État des vérifications

Vérifié de bout en bout via l'API (curl), SQLite direct et Playwright
(navigateur headless réel) : import GraphHopper France entière, filtrage
`moto_no_fast` (smoke test), calcul d'itinéraire via le backend, CRUD
complet trajets et POI, persistance après redémarrage du conteneur
backend, accessibilité LAN du backend (`ss -tlnp` + requête depuis l'IP LAN
de la machine), non-exposition de GraphHopper hors loopback, et parcours
utilisateur complet dans un vrai navigateur (clic carte → calcul →
sauvegarde → rechargement, y compris les cas d'erreur de routage).

**Non vérifié dans cet environnement** : l'accès depuis un second appareil
physique du LAN (un seul appareil disponible pour les vérifications) —
seule l'accessibilité réseau (port en écoute sur l'IP LAN) a été confirmée.
