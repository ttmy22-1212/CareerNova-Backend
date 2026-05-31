# ==========================================
# Stage 1: Build source code
# ==========================================
FROM node:20-alpine AS builder
WORKDIR /app

# Cài đặt openssl cho Prisma trên môi trường Alpine
RUN apk add --no-cache openssl

# Copy file package và lock
COPY package.json yarn.lock ./
COPY prisma ./prisma/

# Cài đặt toàn bộ dependencies
RUN yarn install --frozen-lockfile

# Generate Prisma Client
RUN npx prisma generate

# Build
COPY . .
RUN yarn build

# Giữ lại dependencies cần cho Production
RUN rm -rf node_modules && yarn install --production --frozen-lockfile

# ==========================================
# Stage 2: Môi trường chạy Production
# ==========================================
FROM node:20-alpine AS runner
WORKDIR /app

RUN apk add --no-cache openssl

COPY --from=builder /app/package.json /app/yarn.lock ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Lệnh chạy bản Production đã được compile
CMD ["node", "dist/main.js"]