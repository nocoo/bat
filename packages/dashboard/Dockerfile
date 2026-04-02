# bat-dashboard — Next.js standalone build with Bun
# Build from monorepo root: docker build -f packages/dashboard/Dockerfile .
#
# Optimized for Railway build speed:
# - Uses bun directly (no pnpm install overhead)
# - Single combined build step
# - Minimal layer count

# --- Stage 1: Install dependencies ---
FROM oven/bun:1 AS deps
WORKDIR /app

# Copy lockfile and workspace config
COPY bun.lock package.json ./

# Copy workspace package.json files (needed for workspace resolution)
COPY packages/shared/package.json ./packages/shared/
COPY packages/dashboard/package.json ./packages/dashboard/

# Install dependencies with bun (faster than pnpm)
RUN bun install --frozen-lockfile

# --- Stage 2: Build ---
FROM oven/bun:1 AS builder
WORKDIR /app

# Copy installed dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/dashboard/node_modules ./packages/dashboard/node_modules

# Copy source files
COPY packages/shared ./packages/shared
COPY packages/dashboard ./packages/dashboard

# Dummy secret to allow NextAuth module to load during Next.js build
ENV AUTH_SECRET=build-placeholder

# Build shared and dashboard in one step
RUN cd packages/shared && bun run build && cd ../dashboard && bun run build

# --- Stage 3: Runtime ---
FROM oven/bun:1 AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=7025

# Copy built assets
COPY --from=builder /app/packages/dashboard/.next/standalone ./
COPY --from=builder /app/packages/dashboard/.next/static ./packages/dashboard/.next/static

# Copy probe install script (served via /api/probe/install.sh)
# standalone server.js does process.chdir(__dirname) → cwd becomes /app/packages/dashboard
COPY probe/install.sh ./packages/dashboard/probe-assets/install.sh

EXPOSE 7025

CMD ["bun", "packages/dashboard/server.js"]
