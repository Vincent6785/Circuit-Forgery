# Image de base épinglée par digest ; Dependabot (écosystème docker) en propose
# les mises à jour. Pas de syntaxe propre à BuildKit : l'image doit aussi se
# construire avec le builder classique de Docker.
FROM eclipse-temurin:25-jre-noble@sha256:d120abd9d8d7dec94520ce974ece62d0e4eed8576eb00bbc84e6128307ab48ef

ARG GRAPHHOPPER_VERSION=11.0
# SHA-256 du jar publié sur la release GitHub : un téléchargement altéré, ou un
# jar remplacé côté release, fait échouer le build au lieu d'être embarqué
# dans l'image publiée. À mettre à jour avec GRAPHHOPPER_VERSION (le digest
# figure sur la page de la release).
ARG GRAPHHOPPER_SHA256=b59c024afe172ec6ec85b6327006c3138ec58c7d0bcd26253d0e42853f613def

# curl sert aussi au healthcheck de docker-compose.yml.
RUN apt-get update \
    && apt-get upgrade -y --no-install-recommends \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 10001 graphhopper \
    && useradd --system --uid 10001 --gid graphhopper --home-dir /graphhopper --shell /usr/sbin/nologin graphhopper

WORKDIR /graphhopper

RUN curl -fsSL --retry 3 -o graphhopper-web.jar \
        "https://github.com/graphhopper/graphhopper/releases/download/${GRAPHHOPPER_VERSION}/graphhopper-web-${GRAPHHOPPER_VERSION}.jar" \
    && echo "${GRAPHHOPPER_SHA256}  graphhopper-web.jar" | sha256sum -c -

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod 0755 /usr/local/bin/docker-entrypoint.sh

EXPOSE 8989 8990

# Même valeur par défaut que docker-compose.yml (à ajuster selon la RAM).
# -XX:+ExitOnOutOfMemoryError : une JVM à court de mémoire s'arrête au lieu de
# rester à moitié fonctionnelle.
ENV JAVA_OPTS="-Xmx16g -XX:+ExitOnOutOfMemoryError"

# L'entrypoint abandonne les privilèges root, puis lance
# `java $JAVA_OPTS -jar graphhopper-web.jar server <CMD>`.
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["/config/config.yml"]
