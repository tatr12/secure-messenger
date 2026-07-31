FROM node:22-alpine AS frontend-builder

WORKDIR /frontend

COPY e2ee-frontend/package.json e2ee-frontend/package-lock.json ./
RUN npm ci

COPY e2ee-frontend/ ./
RUN npm run build


FROM nginx:1.30.4-alpine

COPY infra/nginx/nginx.conf /etc/nginx/nginx.conf
COPY --from=frontend-builder /frontend/dist /usr/share/nginx/html
