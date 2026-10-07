# Build the client
FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

# Runtime: the server has no dependencies, just Node 24 (built-in TypeScript and SQLite)
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data STATIC_DIR=/app/dist
COPY --from=build /app/dist ./dist
COPY server ./server
COPY package.json ./
# never run as root: the database volume belongs to the unprivileged `node` user
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server/index.ts"]
