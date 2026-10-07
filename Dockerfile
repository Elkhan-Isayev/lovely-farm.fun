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
VOLUME /data
EXPOSE 3000
CMD ["node", "server/index.ts"]
