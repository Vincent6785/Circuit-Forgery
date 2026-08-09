# --- Stage 1: build du frontend statique (Leaflet bundlé, pas de dépendance CDN au runtime) ---
FROM node:22-slim AS frontend-builder
WORKDIR /frontend
COPY frontend/package.json ./
# vite (le build tool lui-même) est une devDependency : --omit=dev le fait
# sauter et casse "npm run build" ("vite: not found") dans un environnement
# réellement propre (repéré via un run CI, jamais localement où le cache
# Docker masquait le problème). PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD garde
# l'intention d'origine (ne pas télécharger les binaires navigateurs de
# Playwright, inutiles pour ce build et coûteux) sans exclure vite.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm install
COPY frontend/ ./
RUN npm run build

# --- Stage 2: backend Python servant l'API et le frontend buildé ---
FROM python:3.12-slim
WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app
COPY --from=frontend-builder /frontend/dist ./app/static

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
