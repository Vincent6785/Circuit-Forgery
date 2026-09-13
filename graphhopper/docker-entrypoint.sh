#!/bin/sh
# Démarre GraphHopper sans privilèges root.
#
# Lancé en root (cas par défaut), le script remet d'abord à l'utilisateur
# "graphhopper" la propriété du cache de graphe — importé par une version
# antérieure de l'image, qui tournait en root, il lui appartiendrait sinon
# encore — puis se relance sans privilèges. Les arguments sont ceux de
# `graphhopper-web.jar server` (fichier de configuration).
set -eu

GRAPH_DIR=/graph-cache

if [ "$(id -u)" = "0" ]; then
    if [ -d "$GRAPH_DIR" ]; then
        # Uniquement les entrées qui n'appartiennent pas déjà à "graphhopper" ;
        # -h : un lien symbolique est modifié lui-même, sa cible jamais.
        find "$GRAPH_DIR" \( ! -user graphhopper -o ! -group graphhopper \) -exec chown -h graphhopper:graphhopper {} +
    fi
    exec setpriv --reuid=graphhopper --regid=graphhopper --init-groups -- "$0" "$@"
fi

# JAVA_OPTS volontairement sans guillemets : plusieurs options JVM séparées
# par des espaces.
# shellcheck disable=SC2086
exec java $JAVA_OPTS -jar /graphhopper/graphhopper-web.jar server "$@"
