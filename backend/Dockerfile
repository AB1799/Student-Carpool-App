FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --chown=node:node src ./src
COPY --chown=node:node database ./database
USER node
ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "src/server.js"]
