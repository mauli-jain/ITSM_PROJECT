FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY package*.json ./
RUN npm ci
COPY --from=build /app/dist ./dist
COPY src ./src
COPY tsconfig.json ./
RUN mkdir -p data && chown -R
node:node /app
USER node
EXPOSE 3000
CMD ["npx", "tsx", "src/server.ts"]