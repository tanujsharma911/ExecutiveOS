# --- Build Stage ---
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Install OpenSSL and CA certificates (required by Prisma)
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# Copy dependency manifests
COPY package*.json ./
COPY server/package*.json ./server/
COPY web/package*.json ./web/

# Install dependencies for both server and web
RUN npm ci --prefix server --include=dev && \
    npm ci --prefix web --include=dev

# Copy source files
COPY server/ ./server/
COPY web/ ./web/

# Generate Prisma client and compile the React frontend to web/dist
RUN npm --prefix server run db:generate && \
    npm --prefix web run build

# --- Runtime Stage ---
FROM node:22-bookworm-slim AS runner

WORKDIR /app

# Install OpenSSL and CA certificates for Prisma query engine at runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

ENV PORT=7461

# Copy built server files (including node_modules and generated Prisma client)
COPY package*.json ./
COPY --from=builder /app/server ./server

# Copy compiled frontend dist (Express serves web/dist automatically)
COPY --from=builder /app/web/dist ./web/dist

EXPOSE 7461

# Apply Prisma migrations to the database and start the server
CMD ["sh", "-c", "npm --prefix server run db:migrate && npm --prefix server start"]
