FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG EXPO_PUBLIC_API_URL
ARG EXPO_PUBLIC_ENABLE_DEMO=false
RUN test -n "$EXPO_PUBLIC_API_URL" && npx expo export --platform web

FROM caddy:2-alpine
COPY deploy.Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
