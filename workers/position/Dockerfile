FROM node:22-alpine
WORKDIR /app
COPY workers/position/package.json ./
RUN npm install --omit=dev
COPY shared ./shared
COPY workers/position/src ./src
CMD ["node", "src/index.js"]
