# === Stage 1: Build Stage ===
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

# git ke saath better-sqlite3 ke liye native C++ build tools install karo
RUN apk add --no-cache git python3 make g++

COPY package.json ./

# Dev dependencies ke saath sab install karo taaki compilation ho sake
RUN npm install

COPY . .

# === Stage 2: Final Production Stage ===
FROM node:20-alpine

WORKDIR /usr/src/app

# Kuch npm deps ko production me git lag sakta hai
RUN apk add --no-cache git

COPY package.json ./

# Builder stage se sirf compiled node_modules aur code uthao (kachra peeche chhoot gaya)
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production
# Tumhare compose file me container port 3333 mapped hai, toh yahan 3333 kar dete hain
EXPOSE 3333

CMD ["npm", "start"]