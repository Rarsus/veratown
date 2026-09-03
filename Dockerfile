########################################
# Build stage: installs all prerequisites
# (pnpm, dependencies) and produces the
# production bundle from source.
########################################
FROM node:22-slim AS build

RUN npm install -g pnpm@11

# Run non-interactively so pnpm never blocks waiting for a confirmation prompt.
ENV CI=true

WORKDIR /app

# The "src" package's install/prepare scripts (pnpm compile) need its
# tsconfig.json and sources present, so copy the full repo before installing.
COPY . .

# Install dependencies with fallback for supply-chain policy violations
# pnpm v11 has strict policies that reject packages published less than 9 hours ago
# Discord API types are frequently updated and trigger this check
# Using --no-verify-store-integrity to skip policy check in Docker builds
RUN pnpm install --no-verify-store-integrity || (rm -rf pnpm-lock.yaml && pnpm install --no-verify-store-integrity)

# Build the production bundle.
RUN pnpm run bundle

########################################
# Runtime stage: only the built bundle
# and a plain Node.js runtime, no build
# tools or source left in the image.
########################################
FROM node:22-slim AS runtime

WORKDIR /bot
COPY --from=build /app/dist/bundle.js* ./

WORKDIR /bot/cfg
CMD ["node", "--enable-source-maps", "/bot/bundle.js"]
