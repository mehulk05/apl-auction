# Build the React client, then serve everything from one Node process.
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY client/package*.json ./client/
RUN npm install --omit=dev --no-audit --no-fund \
 && npm install --prefix client --no-audit --no-fund
COPY . .
RUN npm run build --prefix client

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 AUCTION_DATA_DIR=/data
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server.js ./server.js
COPY --from=build /app/src ./src
COPY --from=build /app/client/dist ./client/dist
COPY --from=build /app/package.json ./package.json
VOLUME /data
EXPOSE 3000
CMD ["node", "server.js"]
