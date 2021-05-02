FROM node:14-alpine as builder

WORKDIR /usr/src/app

COPY package*.json ./

COPY prisma ./

RUN npm ci

COPY . .

RUN npm run build

RUN npm prune --production

FROM node:14-alpine as runner

COPY --from=builder /usr/src/app/node_modules node_modules
COPY --from=builder /usr/src/app/build build
COPY --from=builder /usr/src/app/package.json .

EXPOSE 3000

CMD [ "node", "build/index.js" ]

