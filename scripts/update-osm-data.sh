#!/usr/bin/env bash
# Met à jour l'extrait OSM France et reconstruit le graphe GraphHopper.
# À exécuter manuellement (trimestre/semestre) : l'import est coûteux en RAM/temps,
# ce n'est pas automatisé en cron.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "1/4 - Arrêt de GraphHopper..."
(cd "$ROOT_DIR" && docker compose stop graphhopper)

echo "2/4 - Téléchargement du nouvel extrait OSM..."
"$SCRIPT_DIR/download-osm-data.sh"

echo "3/4 - Suppression du cache de graphe (reconstruction complète nécessaire)..."
(cd "$ROOT_DIR" && docker compose run --rm --entrypoint sh graphhopper -c "rm -rf /graph-cache/*")

echo "4/4 - Redémarrage de GraphHopper (réimport, peut prendre 20-60 min)..."
(cd "$ROOT_DIR" && docker compose up -d graphhopper)
(cd "$ROOT_DIR" && docker compose logs -f graphhopper)
