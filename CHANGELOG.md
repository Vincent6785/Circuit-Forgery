# Journal des modifications

Les changements notables du projet sont consignés ici. Format inspiré de
[Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versions selon
[Semantic Versioning](https://semver.org/lang/fr/) : chaque tag `vX.Y.Z`
publie les images Docker correspondantes.

## [Non publié]

### Ajouté

- Itinéraire A → B éditable : champs Départ / Arrivée / Étape avec recherche
  d'adresse, marqueurs A / B / étapes numérotées déplaçables, suppression au
  clic droit, insertion d'étape en glissant le tracé, sidebar en onglets
  (#21).
- Tests unitaires frontend (Vitest) exécutés en CI (#21, #23).
- Liste allégée des trajets sauvegardés (`GET /api/routes?view=summary`) et
  sondes `/api/health/live` et `/api/health/ready` (#25).
- CodeQL, Dependabot, analyse Trivy des images, `pip-audit` et `npm audit`
  en CI ; images publiées pour les tags de version, avec provenance et SBOM.
- En-têtes de sécurité (Content-Security-Policy, nosniff, Referrer-Policy…)
  et fond de carte configurable (`CF_TILE_URL`, `CF_TILE_ATTRIBUTION`,
  `GET /api/config`).
- Vérification de types (JSDoc + TypeScript) des modules frontend `utils`,
  `state` et `api`, exécutée en CI.
- Export GPX du trajet affiché, même non sauvegardé (`POST /api/gpx/export`).
- Renommage d'un trajet en mode modification.
- Gestes tactiles (Pointer Events) pour glisser le tracé et dessiner une zone
  à éviter ; panneau repliable sur mobile ; indicateur de calcul en cours.

### Modifié

- Nombre maximal de points par trajet porté à 100 (`CF_MAX_WAYPOINTS`) (#24).
- FastAPI 0.141 / Starlette 1.6 et dépendances à jour (#24).
- Conteneurs exécutés sans privilèges root (reprise automatique des données
  existantes), dépendances Python figées avec hashes, `npm ci`, images de
  base épinglées par digest, GraphHopper sur Ubuntu 24.04 (Temurin 21).
- Journaux Docker avec rotation ; mise à jour des données OSM sans
  interruption pendant le téléchargement, extrait précédent conservé.
- Frontend : abonnements au store filtrés par clés et mises à jour
  imbriquées mises en file, drapeau explicite `userChange` à la place de
  `silent` ; requêtes remplacées annulées (AbortController) ; suppression
  confirmée dans le bouton lui-même au lieu de `window.confirm` ; accès
  internes de test absents du build de production ; tuiles sans sous-domaine
  `{s}`.

### Corrigé

- Brouillon : identifiants de points dupliqués après restauration, tracé
  enregistré pour les points précédents, brouillon recréé après effacement,
  mode modification perdu au rechargement (#23).
- Alternatives périmées après déplacement d'un point, édition d'un point
  effacée par un calcul, erreurs de validation affichées
  « [object Object] », double calcul à l'import GPX (#23).
- Mise à jour partielle d'un trajet (description non effaçable, champs
  ignorés), GPX tronqué sans l'arrivée, bornes de legs du circuit en boucle,
  horodatages sans fuseau (#24).
- Trajet sauvegardé rouvert sans couleurs de vitesse ni distances par étape,
  cache Nominatim non borné et recherches sérialisées (#25).
- Boutons masqués restés visibles, mise en page mobile (#21).
- Popups de zones à éviter fermés par la fin d'un calcul, saisie du
  formulaire de point d'intérêt perdue en cas d'échec, libellés de listes et
  alternatives inaccessibles au clavier, message d'information annoncé comme
  une alerte.

### Sécurité

- XSS stockée dans le popup des points d'intérêt (#21).
- Vulnérabilités connues de Starlette et python-multipart ; corps de
  requête bornés avant lecture ; NaN/Infinity refusés ; messages d'erreur
  amont assainis (#24).
- Jar GraphHopper vérifié par SHA-256 au build ; correctifs de sécurité
  Debian appliqués à l'image backend.
