FROM node:22-alpine
WORKDIR /app
COPY workers/emergency/package.json ./
RUN npm install --omit=dev
COPY shared ./shared
COPY workers/emergency/src ./src
CMD ["node", "src/index.js"]
