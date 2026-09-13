#!/usr/bin/env bash
# Télécharge l'extrait OSM France entière depuis Geofabrik et vérifie son intégrité.
#
# Le fichier est d'abord téléchargé à côté de l'extrait en place, vérifié,
# puis substitué d'un seul coup : un téléchargement interrompu ou corrompu
# laisse l'extrait précédent intact. Celui-ci est conservé en
# france-latest.osm.pbf.previous pour pouvoir revenir en arrière.
set -euo pipefail

for tool in curl md5sum; do
  command -v "$tool" > /dev/null || { echo "Outil manquant : $tool" >&2; exit 1; }
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
OSM_DIR="$ROOT_DIR/data/osm"
PBF_NAME="france-latest.osm.pbf"
PBF_URL="https://download.geofabrik.de/europe/$PBF_NAME"
PBF_FILE="$OSM_DIR/$PBF_NAME"
WORK_DIR="$OSM_DIR/.download"

mkdir -p "$WORK_DIR"

echo "Téléchargement de l'extrait OSM France depuis Geofabrik..."
# --continue-at - : reprend un téléchargement interrompu (~5 Go) au lieu de
# tout recommencer ; --retry : tolère une coupure réseau passagère.
curl -L --fail --retry 5 --retry-delay 10 --continue-at - -o "$WORK_DIR/$PBF_NAME" "$PBF_URL"
curl -L --fail --retry 5 -o "$WORK_DIR/$PBF_NAME.md5" "$PBF_URL.md5"
last_modified="$(curl -sIL --fail "$PBF_URL" | awk -F': ' 'tolower($1) == "last-modified" { sub("\r", "", $2); print $2 }' | tail -1)"

echo "Vérification de l'intégrité (md5)..."
if ! (cd "$WORK_DIR" && md5sum -c "$PBF_NAME.md5"); then
  # Un fichier partiel corrompu ne doit pas servir de base à la reprise suivante.
  rm -f "$WORK_DIR/$PBF_NAME"
  echo "Échec de la vérification : extrait en place conservé." >&2
  exit 1
fi

if [[ -f "$PBF_FILE" ]]; then
  mv -f "$PBF_FILE" "$PBF_FILE.previous"
fi
mv -f "$WORK_DIR/$PBF_NAME" "$PBF_FILE"
mv -f "$WORK_DIR/$PBF_NAME.md5" "$PBF_FILE.md5"

# Trace de la version des données importées (attribution ODbL, cf. LICENSE-DATA.md).
{
  echo "source=$PBF_URL"
  echo "last_modified=${last_modified:-inconnu}"
  echo "downloaded_at=$(date -Iseconds)"
} > "$PBF_FILE.info"

echo "OK — extrait téléchargé et vérifié : $PBF_FILE"
cat "$PBF_FILE.info"
