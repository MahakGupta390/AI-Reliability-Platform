# ── Stage 1: Base ──────────────────────────────────────────────────────────────
# Use Node LTS on Alpine (tiny ~50MB vs ~900MB for full Debian image).
# Alpine matters in production: faster pulls, smaller attack surface.
FROM node:20-alpine AS base

# Set working directory inside container
WORKDIR /app

# Copy package files FIRST (before source code).
# WHY: Docker layer caching. If package.json hasn't changed, Docker reuses
# the npm install layer. Copying source AFTER means code changes don't
# invalidate the dependency cache — faster rebuilds.
COPY package*.json ./

# ── Stage 2: Dependencies ──────────────────────────────────────────────────────
FROM base AS deps

# Install only production dependencies
# --omit=dev skips devDependencies (nodemon etc.) — not needed at runtime
RUN npm install --omit=dev

# ── Stage 3: Final image ────────────────────────────────────────────────────────
FROM base AS final

# Copy installed node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application source
COPY . .

# Create logs directory (Winston writes here)
RUN mkdir -p logs

# Don't run as root — security best practice
# If an attacker exploits the app, they get a limited user, not root
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

# Document which port this service listens on (informational, not binding)
EXPOSE 3001

# Health check: Docker will poll this to know if container is healthy
# --interval: how often to check
# --timeout: how long to wait for response
# --retries: how many failures before marking unhealthy
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

# Start the service
CMD ["node", "server.js"]
