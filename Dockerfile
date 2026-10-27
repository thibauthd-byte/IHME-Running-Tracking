# 1. Étape de compilation du front-end React
FROM node:24-bookworm-slim AS build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
ARG BASE_PATH=/
RUN npm run build -- --base="${BASE_PATH}"

# 2. Étape d'exécution du serveur Express
FROM node:24-bookworm-slim
ENV NODE_ENV=production PORT=3000
WORKDIR /app

# Dépendances du backend
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev && npm cache clean --force

# Copie du backend et du build statique React
COPY --chown=node:node backend/ ./backend/
COPY --from=build --chown=node:node /app/frontend/dist ./dist

USER node
EXPOSE 3000
CMD ["node", "backend/server.js"]
