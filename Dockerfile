# ==========================================
# Stage 1: Build source code
# ==========================================
FROM node:20-alpine AS builder
WORKDIR /app

RUN apk add --no-cache openssl

COPY package.json yarn.lock ./
COPY prisma ./prisma/

# Cài đặt TOÀN BỘ dependencies để phục vụ cho việc build
RUN yarn install --frozen-lockfile

COPY . .
RUN npx prisma generate
RUN yarn build

RUN rm -rf node_modules && yarn install --production --frozen-lockfile

# ==========================================
# Stage 2: Môi trường chạy Production
# ==========================================
FROM node:20-alpine AS runner
WORKDIR /app

RUN apk add --no-cache openssl

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app/package.json /app/yarn.lock ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000

CMD ["node", "dist/main.js"]