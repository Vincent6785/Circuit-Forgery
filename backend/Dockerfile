# --- Stage 1: build du frontend statique (Leaflet bundlé, pas de dépendance CDN au runtime) ---
FROM node:22-slim AS frontend-builder
WORKDIR /frontend
COPY frontend/package.json ./
# --omit=dev : Playwright (test e2e) n'est pas nécessaire pour construire les assets statiques
RUN npm install --omit=dev
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
