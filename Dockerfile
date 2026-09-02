# Backend image for the St. Clair's / Crown & Leaf API.
FROM node:20-slim

# OpenSSL is needed by Prisma.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first for better layer caching. The Prisma schema is copied too,
# so the `postinstall` hook (`prisma generate`) has it available.
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev

# App source.
COPY . .

ENV NODE_ENV=production
EXPOSE 5000
CMD ["node", "src/server.js"]
