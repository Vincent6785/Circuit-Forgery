#!/usr/bin/env bash
# Vérifie que le profil moto_no_fast ne retourne jamais de segment avec max_speed > 80 km/h.
# Nécessite: curl, jq. GraphHopper doit tourner sur GRAPHHOPPER_URL (défaut: http://localhost:8989).
set -euo pipefail

GRAPHHOPPER_URL="${GRAPHHOPPER_URL:-http://localhost:8989}"
PROFILE="moto_no_fast"

# name;from_lat,from_lon;to_lat,to_lon
TRIPS=(
  "urbain_court;48.8566,2.3522;48.8738,2.2950"      # Paris intra-muros
  "regional_moyen;48.8566,2.3522;47.2184,-1.5536"   # Paris -> Nantes
  "inter_regional_long;48.8566,2.3522;45.7640,4.8357" # Paris -> Lyon (évite normalement l'A6)
)

fail=0

for trip in "${TRIPS[@]}"; do
  IFS=';' read -r name from to <<< "$trip"

  # moto_no_fast n'a pas de préparation CH (custom_model figé à l'import) : il faut explicitement
  # désactiver CH pour que GraphHopper utilise la préparation LM (Landmarks) de ce profil.
  response=$(curl -sS -G "$GRAPHHOPPER_URL/route" \
    --data-urlencode "point=$from" \
    --data-urlencode "point=$to" \
    --data-urlencode "profile=$PROFILE" \
    --data-urlencode "points_encoded=false" \
    --data-urlencode "ch.disable=true" \
    --data-urlencode "details=max_speed" \
    --data-urlencode "details=road_class")

  if ! echo "$response" | jq -e '.paths[0]' > /dev/null 2>&1; then
    echo "[ÉCHEC] $name: aucun trajet retourné"
    echo "$response" | jq . 2>/dev/null || echo "$response"
    fail=1
    continue
  fi

  distance_km=$(echo "$response" | jq -r '.paths[0].distance / 1000 | floor')
  max_speed_seen=$(echo "$response" | jq -r '[.paths[0].details.max_speed[]? | .[2] // 0] | max // 0')
  over_80=$(echo "$response" | jq -r '[.paths[0].details.max_speed[]? | .[2] // 0] | any(. > 80)')

  if [[ "$over_80" == "true" ]]; then
    echo "[ÉCHEC] $name: distance ${distance_km}km, un segment a max_speed=${max_speed_seen} (> 80)"
    fail=1
  else
    echo "[OK] $name: distance ${distance_km}km, max_speed observé max=${max_speed_seen}"
  fi
done

if [[ "$fail" -eq 1 ]]; then
  echo "Smoke test échoué."
  exit 1
fi

echo "Smoke test réussi : aucun trajet ne dépasse 80 km/h sur les segments testés."
