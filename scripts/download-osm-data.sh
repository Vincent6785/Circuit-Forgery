#!/usr/bin/env bash
# Télécharge l'extrait OSM France entière depuis Geofabrik et vérifie son intégrité.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
OSM_DIR="$ROOT_DIR/data/osm"
PBF_URL="https://download.geofabrik.de/europe/france-latest.osm.pbf"
PBF_FILE="$OSM_DIR/france-latest.osm.pbf"

mkdir -p "$OSM_DIR"

echo "Téléchargement de l'extrait OSM France depuis Geofabrik..."
curl -L --fail -o "$PBF_FILE" "$PBF_URL"
curl -L --fail -o "$PBF_FILE.md5" "$PBF_URL.md5"

echo "Vérification de l'intégrité (md5)..."
(cd "$OSM_DIR" && md5sum -c "$(basename "$PBF_FILE.md5")")

echo "OK — extrait téléchargé et vérifié : $PBF_FILE"
echo "Date de téléchargement : $(date -Iseconds)"
