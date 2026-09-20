FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY foundry.toml ./
COPY src ./src
COPY scripts ./scripts
RUN npm run compile
ENTRYPOINT ["npm", "run"]
