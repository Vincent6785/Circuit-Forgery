# Circuit Forgery

Planificateur de trajets moto en France : calcule des itinéraires qui évitent les
axes signalés à plus de 80 km/h, en s'appuyant sur les données OpenStreetMap
(GraphHopper self-hébergé). Déploiement 100% local, accessible aux machines du
réseau local (LAN) uniquement — voir [LICENSE-DATA.md](LICENSE-DATA.md) pour la
licence des données.

## Fonctionnalités

- **Création de trajet** : clic gauche sur la carte pour ajouter un point de
  départ/arrivée/étape, calcul automatique de l'itinéraire (filtré > 80 km/h).
- **Édition complète des waypoints** : liste réordonnable dans la sidebar
  (glisser-déposer ou boutons ▲▼, accessibles au clavier/tactile),
  suppression d'un point précis, sélection d'un marqueur + touche Suppr,
  insertion d'un point en glissant directement sur le tracé affiché entre
  deux waypoints existants. Chaque point est en plus **éditable finement**
  (clic sur son libellé dans la liste) : renommage et coordonnées exactes
  (lat/lon), avec la distance depuis l'étape précédente affichée à côté.
  **Annuler/rétablir** (boutons dédiés ou Ctrl+Z / Ctrl+Maj+Z) couvre toutes
  ces mutations, y compris l'ajout/retrait d'une zone à éviter — un seul
  historique partagé.
- **Circuit en boucle** : distance cible + un clic sur la carte comme point
  de départ génère une boucle fermée (algorithme `round_trip` de
  GraphHopper) adoptée comme des waypoints normaux, donc éditable ensuite
  avec les outils ci-dessus ; bouton "Autre variante" pour une forme
  différente à distance équivalente. "Fermer la boucle" (ajoute le point de
  départ en fin de trajet) et "Inverser le sens" complètent un trajet
  construit manuellement. Le mode "clic pour générer" se quitte sans rien
  créer via Échap ou le lien "Annuler" affiché pendant l'attente. Quand le
  tracé généré est trop dense pour tenir dans la limite de waypoints, un
  bandeau signale que la boucle affichée est une version simplifiée du
  tracé réel calculé par GraphHopper.
- **Évitement d'une zone** : mode dédié pour dessiner un cercle (glisser sur
  la carte = centre puis rayon) que le calcul d'itinéraire doit contourner —
  le filtre anti->80km/h reste actif en plus de cette contrainte. Un champ
  "Rayon (m)" optionnel permet de poser une zone d'un rayon précis par
  simple tap/clic (sans glisser), en complément du réglage visuel au
  glisser. Les zones actives sont listées, retirables individuellement, et
  persistées avec un trajet sauvegardé.
- **Itinéraires alternatifs** : pour un trajet à exactement 2 points
  (départ/arrivée), jusqu'à 3 tracés distincts proposés au choix. Désactivé
  tant qu'une zone à éviter est active (voir Limitations connues).
- **Recherche d'adresse** : géocodage via Nominatim (OpenStreetMap), un clic
  sur un résultat ajoute le point au trajet.
- **Points d'intérêt** : ajout par clic droit sur la carte (nom, catégorie,
  notes), icônes par catégorie, liste dédiée dans la sidebar, suppression
  avec confirmation.
- **Brouillon persistant** : le trajet en cours de construction est
  automatiquement sauvegardé en local (localStorage) et restauré si la page
  est rechargée par accident.
- **Description de trajet** : champ de notes libre associé à un trajet
  sauvegardé, affiché en survol dans la liste des trajets.
- **Édition d'un trajet déjà sauvegardé** : bouton "Modifier" dans la liste
  des trajets sauvegardés, modification du tracé puis "Enregistrer les
  modifications" (distinct de la création d'un nouveau trajet). Bouton
  "Dupliquer" pour repartir d'une copie indépendante (nom pré-rempli
  "Copie de …") sans modifier l'original.
- **Import/export GPX** : export d'un trajet sauvegardé au format GPX,
  import d'un fichier GPX externe — les waypoints sont **extraits puis
  recalculés** par le moteur de routage (pas de rejeu tel quel), pour que le
  filtre anti->80km/h s'applique toujours même à un trajet importé.

**Limitations connues** (vérifiées, pas des oublis) :
- Pas de profil altimétrique/dénivelé — l'instance GraphHopper n'a pas
  l'élévation activée (`"elevation": false`), ce qui nécessiterait un
  réimport complet avec données SRTM.
- Les itinéraires alternatifs ne sont proposés que pour un trajet à
  exactement 2 points (départ/arrivée) — GraphHopper `alternative_route`
  n'a de sens visuel clair que dans ce cas, pas pour un trajet à étapes.
  Ils sont aussi désactivés dès qu'une zone à éviter est active : vérifié
  empiriquement que GraphHopper ignore silencieusement `algorithm=alternative_route`
  dès que `custom_model` (nécessaire pour exclure une zone) est présent
  dans la requête — combiner les deux renverrait un unique tracé présenté à
  tort comme "alternatives".
- Les zones à éviter ne sont pas incluses dans l'export/import GPX (aucune
  représentation standard pour ça dans ce format) — seuls les waypoints et
  le tracé le sont.
- L'insertion d'un point en glissant sur le tracé (`route-insert-interaction.js`)
  n'a pas d'équivalent tactile/précis, contrairement aux zones à éviter —
  pas d'appareil tactile disponible pour concevoir et vérifier correctement
  une alternative.

## Démarrage

Prérequis : Docker + docker compose plugin.

```bash
./scripts/download-osm-data.sh   # télécharge data/osm/france-latest.osm.pbf (~4,7 Go)
docker compose build             # construit l'image GraphHopper et l'image backend (inclut le build du frontend)
docker compose up -d             # démarre les deux services
```

`docker compose up -d` suffit désormais : un healthcheck Docker sur
GraphHopper (endpoint `/healthcheck` du port admin Dropwizard) fait attendre
le démarrage du backend jusqu'à ce que le graphe soit effectivement chargé
(`depends_on: condition: service_healthy`) — plus besoin de suivre les logs
manuellement. Le tout premier import à froid reste long (5-60 min selon la
machine) ; suivre la progression avec `docker compose logs -f graphhopper` ou
`docker compose ps` (colonne `STATUS`, passe de `starting` à `healthy`) reste
possible mais n'est plus nécessaire pour enchaîner les commandes.

L'application est alors accessible sur `http://localhost:8000` et, depuis toute
autre machine du même réseau local, sur `http://<IP-LAN-de-la-machine>:8000`
(trouver l'IP avec `ip -4 addr show`). GraphHopper (port 8989) n'est publié que
sur `127.0.0.1` — il n'est joignable ni depuis le LAN ni depuis l'extérieur,
seul le backend proxy l'est.

## Vérifier que le filtrage fonctionne

```bash
./scripts/smoke-test-routing.sh
```

Ce script échoue si un trajet calculé par le profil `moto_no_fast` contient un
segment avec une limite de vitesse signalée > 80 km/h.

## Tests end-to-end (Playwright)

Nécessite la stack Docker démarrée (`docker compose up -d`, cf. Démarrage) —
les tests s'exécutent contre l'application réelle (frontend + backend +
GraphHopper), pas de mocks.

```bash
cd frontend
npm install
npx playwright install --with-deps chromium   # une seule fois
npm run test:e2e
```

`--with-deps` installe aussi les bibliothèques système nécessaires au
navigateur headless ; le script est pensé pour Debian/Ubuntu et peut échouer
sur Arch Linux (ou toute distro non supportée) — dans ce cas, retirer
`--with-deps`, lancer `npx playwright install chromium` seul, puis installer
manuellement les dépendances système manquantes indiquées par l'erreur au
premier `npm run test:e2e` (`sudo pacman -S ...` ou équivalent).

Suites dans `frontend/tests/e2e/` (une par fonctionnalité) : `route-planning`,
`route-error-handling` (régression du bug "point sans route à proximité", cf.
section suivante — message inline, pas de popup navigateur, statut HTTP 422),
`waypoint-editing`, `address-search` (mock ciblé de `/api/geocode`, seule
exception à la règle "pas de mocks" — Nominatim est un service tiers à
rate-limit strict), `poi`, `draft-persistence`, `route-edit`,
`gpx-import-export`.

### Lint frontend

```bash
cd frontend
npm run lint
```

ESLint (config plate minimale, `eslint:recommended`) sur `frontend/src`.

## Tests backend (pytest)

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

Via Docker plutôt qu'un virtualenv local : garantit la même version de Python
que l'image de production (`backend/Dockerfile`) sans dépendre de la version
de `python3` installée sur la machine hôte (`pydantic-core` n'a par exemple
pas encore de wheel pour Python 3.14 au moment de l'écriture). Un virtualenv
local fonctionne aussi tant que `python3` pointe vers une version ≤ 3.13 :
`python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt &&
.venv/bin/python -m pytest`.

## Mettre à jour les données OSM

```bash
./scripts/update-osm-data.sh
```

Pas d'automatisation en cron : l'import complet de la France consomme beaucoup de
RAM et prend plusieurs minutes, mieux vaut le déclencher consciemment.

## Point de vigilance : modifier `moto_no_fast.json` nécessite un réimport complet

GraphHopper marque les sous-réseaux non connectés (`PrepareRoutingSubnetworks`) et
prépare les landmarks (LM) **pour la formule de pondération exacte du custom model
au moment de l'import**, et persiste ce marquage dans `graph-cache`. Modifier
`graphhopper/custom_models/moto_no_fast.json` sans reconstruire le graphe peut
laisser GraphHopper utiliser un graphe dont la connectivité a été calculée pour
l'ancienne version du modèle. Après toute modification de ce fichier :

```bash
docker compose down
docker volume rm circuit-forgery_graph-cache
docker compose up -d graphhopper
```

**Deux pièges rencontrés en développement**, tous deux visibles dans les logs
`PrepareRoutingSubnetworks` à l'import (nombre de composantes connectées) :

1. Une exclusion dure (`multiply_by: 0`) sur `road_class == MOTORWAY || TRUNK`
   fragmentait le graphe France en 969 composantes déconnectées (au lieu d'un
   seul réseau), car certaines routes nationales taguées `TRUNK` sont l'unique
   liaison viable entre deux régions, même à vitesse ≤ 80 km/h. `road_class` ne
   sert donc plus qu'à **pénaliser fortement** (jamais exclure) MOTORWAY/TRUNK/
   PRIMARY.
2. Après correction du point 1, la fragmentation persistait quasi à l'identique
   (968 composantes). Cause réelle : GraphHopper encode un `max_speed` absent de
   tag OSM comme **+infini** (`use_maximum_as_infinity`) — très fréquent sur les
   petites routes rurales/communales françaises, qui n'ont souvent aucun tag
   `maxspeed` explicite. La condition `max_speed > 80` excluait donc aussi
   *toutes* les routes sans limite affichée. Le modèle final utilise
   `max_speed > 80 && max_speed < 1000` pour ne cibler que les vitesses
   *réellement connues et élevées* ; les routes sans tag retombent sur les
   règles `road_class` (unclassified/residential/tertiary → priorisées). Après
   ce correctif : 69 composantes, la plus grande couvrant l'essentiel du réseau
   routable (comparable au profil `car` de référence).

Le modèle final n'a donc qu'**une seule exclusion dure** : `max_speed` connu et
`> 80` — exactement l'exigence de l'utilisateur, ni plus ni moins.

## Point de vigilance : erreurs de calcul d'itinéraire (point hors réseau routier)

Cliquer un point sans route à proximité (en mer, zone très isolée) fait répondre
GraphHopper en **HTTP 400** (`PointNotFoundException` ou `ConnectionNotFoundException`).
`backend/app/services/graphhopper_client.py` distingue ce cas (entrée utilisateur,
GraphHopper a bien répondu) d'une vraie panne GraphHopper (erreur réseau/5xx) :
- point/connexion non trouvé → `GraphHopperRouteNotFoundError` → **422** côté API,
  message français affiché dans un bandeau inline (`#route-error`) côté frontend.
- GraphHopper injoignable → `GraphHopperUnavailableError` → **503**.

Avant ce correctif, les deux cas remontaient en 502 et le frontend affichait une
popup `alert()` bloquante — repéré via les logs (`docker compose logs backend`,
requêtes `502 Bad Gateway` corrélées à des `PointNotFoundException` GraphHopper
au même timestamp). Couvert en régression par
`frontend/tests/e2e/route-error-handling.spec.js`.

## Dépannage import (RAM)

`JAVA_OPTS` dans `docker-compose.yml` (service `graphhopper`) contrôle la heap JVM
(`-Xmx`). Prévoir 8-16 Go pour la France entière ; augmenter si `OutOfMemoryError`
pendant l'import.

## État des vérifications

Vérifié de bout en bout via l'API (curl), SQLite direct et Playwright (navigateur
headless réel) : import GraphHopper France entière, filtrage `moto_no_fast`
(smoke test 3 trajets), calcul d'itinéraire via le backend, CRUD complet trajets
et POI, persistance après redémarrage du conteneur backend, accessibilité LAN du
backend (`ss -tlnp` + requête depuis l'IP LAN de la machine), non-exposition de
GraphHopper hors loopback, et parcours utilisateur complet dans un vrai
navigateur (clic carte → calcul → sauvegarde → rechargement, y compris le cas
d'erreur "point sans route à proximité").

**Non vérifié dans cet environnement** : l'accès depuis un second appareil
physique du LAN (un seul appareil disponible ici) — seule l'accessibilité
réseau (port en écoute sur l'IP LAN) a été confirmée.

## Architecture

Voir le plan de développement complet dans l'historique du projet. En résumé :
GraphHopper (routage, profil `moto_no_fast` custom model) + backend FastAPI
(proxy/enrichissement + persistance SQLite des trajets/POI, sert aussi le
frontend buildé) + frontend Leaflet (carte, sélection de points, sauvegarde de
trajets).
