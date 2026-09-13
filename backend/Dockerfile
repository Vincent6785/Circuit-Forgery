# Images de base épinglées par digest (builds reproductibles, provenance
# vérifiable) ; Dependabot (écosystème docker) en propose les mises à jour.
# Pas de syntaxe propre à BuildKit (RUN --mount, COPY --chmod) : l'image doit
# aussi se construire avec le builder classique de Docker.

# --- Stage 1: build du frontend statique (Leaflet bundlé, pas de dépendance CDN au runtime) ---
FROM node:22-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5 AS frontend-builder
WORKDIR /frontend
# Lockfile copié avec package.json, puis `npm ci` : versions exactes du
# lockfile, et échec s'il n'est plus synchronisé avec package.json — au lieu
# d'un `npm install` qui résolvait des versions différentes d'un build à
# l'autre. vite étant une devDependency, elles ne sont pas omises (sans quoi
# "npm run build" échoue avec "vite: not found") ; les navigateurs de
# Playwright, inutiles ici, ne sont pas téléchargés.
COPY frontend/package.json frontend/package-lock.json ./
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# --- Stage 2: backend Python servant l'API et le frontend buildé ---
FROM python:3.12-slim-trixie@sha256:78387bc3881b8273120a12ebe6c1ab22b018ccc2c9adf565ae1ac9b536e184ea

# Utilisateur non privilégié. UID/GID 1000 par défaut : celui de l'utilisateur
# principal sur la plupart des hôtes Linux, pour que les fichiers du volume
# ./backend/data restent modifiables depuis l'hôte.
ARG APP_UID=1000
ARG APP_GID=1000

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# apt-get upgrade : applique les correctifs de sécurité Debian publiés depuis
# la construction de l'image de base (la CI bloque sur toute vulnérabilité
# HIGH/CRITICAL corrigée qui resterait, cf. .github/workflows/ci.yml).
RUN apt-get update \
    && apt-get upgrade -y --no-install-recommends \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid "${APP_GID}" app \
    && useradd --system --uid "${APP_UID}" --gid app --home-dir /app --shell /usr/sbin/nologin app

WORKDIR /app

# --require-hashes : chaque paquet, dépendances transitives comprises, doit
# correspondre au hash figé dans requirements.lock.
COPY backend/requirements.lock .
RUN pip install --require-hashes --no-deps -r requirements.lock

COPY backend/app ./app
COPY --from=frontend-builder /frontend/dist ./app/static
COPY backend/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod 0755 /usr/local/bin/docker-entrypoint.sh

EXPOSE 8000

# L'entrypoint abandonne les privilèges root avant de lancer la commande.
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
