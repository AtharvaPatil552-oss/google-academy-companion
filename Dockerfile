FROM node:22-slim

WORKDIR /app

COPY package.json bun.lock ./

RUN npm install

COPY . .

RUN npm run build

ENV NODE_ENV=production

CMD ["node", "dist/server.js"]