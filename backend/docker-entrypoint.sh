#!/bin/sh
# Démarre le backend sans privilèges root.
#
# Lancé en root (cas par défaut), le script remet d'abord à l'utilisateur
# "app" la propriété du répertoire de données — une base créée par une
# version antérieure de l'image, qui tournait en root, lui appartiendrait
# sinon encore et ne serait plus modifiable — puis abandonne définitivement
# les privilèges avant d'exécuter la commande. Lancé avec un autre
# utilisateur (option `user:` de docker-compose), il exécute simplement la
# commande.
set -eu

DATA_DIR="$(dirname "${CF_DATABASE_PATH:-/data/circuit-forgery.db}")"

if [ "$(id -u)" = "0" ]; then
    if [ "$DATA_DIR" != "/" ]; then
        mkdir -p "$DATA_DIR"
        # Uniquement les entrées qui n'appartiennent pas déjà à "app" (pas de
        # chown récursif complet à chaque démarrage) ; -h : un lien symbolique
        # est modifié lui-même, sa cible jamais.
        find "$DATA_DIR" \( ! -user app -o ! -group app \) -exec chown -h app:app {} +
    fi
    exec setpriv --reuid=app --regid=app --init-groups -- "$@"
fi

exec "$@"
