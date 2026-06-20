FROM node:20-alpine

WORKDIR /usr/src/app

# Some npm deps may use git
RUN apk add --no-cache git

COPY package.json .
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
