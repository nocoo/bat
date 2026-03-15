# bat-dashboard — Next.js standalone build with Bun
# Build from monorepo root: docker build -f packages/dashboard/Dockerfile .

# --- Stage 1: Install dependencies ---
FROM oven/bun:1 AS deps
WORKDIR /app

# Copy root workspace config
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Copy shared package (workspace dependency)
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/
COPY packages/shared/src ./packages/shared/src

# Copy dashboard package
COPY packages/dashboard/package.json ./packages/dashboard/

# Install with pnpm (needed for workspace resolution)
RUN bun install -g pnpm && pnpm install --frozen-lockfile --filter @bat/dashboard...

# --- Stage 2: Build ---
FROM oven/bun:1 AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared ./packages/shared
COPY --from=deps /app/packages/dashboard/node_modules ./packages/dashboard/node_modules

# Copy shared source and build it
COPY packages/shared ./packages/shared
RUN cd packages/shared && bun run build

# Copy dashboard source
COPY packages/dashboard ./packages/dashboard
RUN cd packages/dashboard && bun run build

# --- Stage 3: Runtime ---
FROM oven/bun:1 AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=7020

# Copy built assets and dependencies
COPY --from=builder /app/packages/dashboard/.next/standalone ./
COPY --from=builder /app/packages/dashboard/.next/static ./packages/dashboard/.next/static
COPY --from=builder /app/packages/dashboard/public ./packages/dashboard/public

EXPOSE 7020

CMD ["bun", "packages/dashboard/server.js"]
