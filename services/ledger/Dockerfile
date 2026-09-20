FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
RUN mkdir -p /data && chown -R node:node /data
USER node
EXPOSE 8001
CMD ["npm", "start"]
