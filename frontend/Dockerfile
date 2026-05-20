# syntax=docker/dockerfile:1

ARG BUN_BUILD_IMAGE=oven/bun:1
ARG BUN_RUNTIME_IMAGE=oven/bun:1-slim

# ---------------------------------------------------------------------------
# Stage 1: Install dependencies and build
# ---------------------------------------------------------------------------
FROM ${BUN_BUILD_IMAGE} AS build

WORKDIR /app

# Install dependencies first (cache layer)
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source and build
COPY . .
RUN bun run build

# ---------------------------------------------------------------------------
# Stage 2: Production runtime
# ---------------------------------------------------------------------------
ARG BUN_RUNTIME_IMAGE
FROM ${BUN_RUNTIME_IMAGE} AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy only the Nitro build output (elkjs is traced via traceDeps in vite.config.ts)
COPY --from=build /app/.output ./.output

EXPOSE 3000

# Health check (Start auth session endpoint)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD bun -e "fetch('http://localhost:3000/_schema-viz/auth/session').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

USER bun

CMD ["bun", "run", ".output/server/index.mjs"]
