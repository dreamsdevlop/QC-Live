FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json* ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
# Uncomment the following line in case you want to disable telemetry during the build.
# ENV NEXT_TELEMETRY_DISABLED 1

RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
# Uncomment the following line in case you want to disable telemetry during runtime.
# ENV NEXT_TELEMETRY_DISABLED 1

# Install FFmpeg and the public-video importer runtime.
RUN apk add --no-cache ffmpeg python3 py3-pip \
  && pip3 install --no-cache-dir --break-system-packages yt-dlp

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Create necessary directories
RUN mkdir -p /app/data /app/public/uploads/thumbnails
RUN chown -R nextjs:nodejs /app/data /app/public

COPY --from=builder /app/public ./public
RUN chown -R nextjs:nodejs /app/public/uploads
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Copy additional files needed at runtime
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/.env.example ./.env.example

# Ensure upload directories are writable
RUN chmod -R 755 /app/public/uploads /app/data

USER nextjs

EXPOSE 3000

ENV PORT 3000

CMD ["node", "server.js"]
