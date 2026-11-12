
FROM node:20-alpine AS build

WORKDIR /app

COPY frontend_old/package*.json ./
RUN npm ci

COPY frontend_old/ ./
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine

COPY frontend_old/nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080
