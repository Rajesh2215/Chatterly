# -------- Build Stage --------
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY tsconfig*.json ./

RUN npm install

COPY src ./src

RUN npm run build

# -------- Production Stage --------
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

# Installs ONLY production dependencies
RUN npm install --omit=dev

# Copies compiled JavaScript from builder stage
COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production
ENV PORT=5001

EXPOSE 5001

CMD ["node", "dist/index.js"]