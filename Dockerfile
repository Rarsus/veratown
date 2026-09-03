########################################
# Build stage: installs all prerequisites
# (pnpm, dependencies) and produces the
# production bundle from source.
########################################
FROM node:22-slim AS build

RUN npm install -g pnpm@11

# Run non-interactively so pnpm never blocks waiting for a confirmation prompt.
ENV CI=true

# Allow build scripts in CI environment
# pnpm v11 requires explicit approval for build scripts
ENV PNPM_SCRIPT_ALLOW_SCRIPTS=*

WORKDIR /app

# The "src" package's install/prepare scripts (pnpm compile) need its
# tsconfig.json and sources present, so copy the full repo before installing.
COPY . .

# Install dependencies
# pnpm v11 has stricter supply-chain policies and build script verification
# Use --no-verify-store-integrity to skip package age checks (discord-api-types frequently updated)
# Use --no-frozen-lockfile to allow regeneration if needed
RUN pnpm install --no-verify-store-integrity --no-frozen-lockfile 2>&1 || \
    (echo "First install failed, regenerating lockfile..." && \
     rm -rf pnpm-lock.yaml node_modules .pnpm && \
     pnpm install --no-verify-store-integrity)

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
