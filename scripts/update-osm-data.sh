#!/usr/bin/env bash
# Met à jour l'extrait OSM France et reconstruit le graphe GraphHopper.
# À exécuter manuellement (trimestre/semestre) : l'import est coûteux en RAM/temps,
# ce n'est pas automatisé en cron.
#
# Le nouvel extrait est téléchargé et vérifié AVANT d'arrêter GraphHopper :
# l'interruption de service se limite au réimport, et un téléchargement en
# échec laisse le service en place.
#
# Variable COMPOSE_FILES (optionnelle) : fichiers compose à utiliser, par
# exemple "-f docker-compose.yml -f docker-compose.images.yml" avec les images
# publiées.
set -euo pipefail

command -v docker > /dev/null || { echo "Outil manquant : docker" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck disable=SC2206
COMPOSE=(docker compose ${COMPOSE_FILES:-})

compose() {
  (cd "$ROOT_DIR" && "${COMPOSE[@]}" "$@")
}

echo "1/4 - Téléchargement et vérification du nouvel extrait OSM..."
"$SCRIPT_DIR/download-osm-data.sh"

echo "2/4 - Arrêt de GraphHopper..."
compose stop graphhopper

echo "3/4 - Suppression du cache de graphe (reconstruction complète nécessaire)..."
compose run --rm --no-deps --entrypoint sh graphhopper -c 'find /graph-cache -mindepth 1 -delete'

echo "4/4 - Redémarrage de GraphHopper (réimport, peut prendre 20-60 min)..."
compose up -d graphhopper

echo "Réimport lancé. Suivi : ${COMPOSE[*]} logs -f graphhopper"
echo "Le service est prêt quand /api/health/ready répond 200 (ou quand le conteneur graphhopper est \"healthy\")."
