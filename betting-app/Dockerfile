# --- Stage 1: build frontend ---
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# --- Stage 2: build backend ---
FROM node:20-alpine AS backend-build
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install
COPY backend/ ./
RUN npm run build

# --- Stage 3: runtime ---
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY backend/package*.json ./
RUN npm install --omit=dev

COPY --from=backend-build /app/backend/dist ./dist
COPY --from=frontend-build /app/frontend/dist ./public

ENV PORT=3000
EXPOSE 3000

CMD ["node", "dist/index.js"]
