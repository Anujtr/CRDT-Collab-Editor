FROM node:20.18-alpine3.20

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 8080

USER node

CMD ["npm", "start"]