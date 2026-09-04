FROM node:22-alpine
WORKDIR /app
COPY api/package.json ./
RUN npm install --omit=dev
COPY shared ./shared
COPY api/src ./src
EXPOSE 3000
CMD ["node", "src/server.js"]
