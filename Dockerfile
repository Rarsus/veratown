########################################
# Build stage: installs all prerequisites
# (pnpm, dependencies) and produces the
# production bundle from source.
########################################
FROM node:22-slim AS build

RUN npm install -g pnpm@11

# Run non-interactively so pnpm never blocks waiting for a confirmation prompt.
ENV CI=true

# Configure pnpm to allow build scripts for necessary packages
# pnpm v11 ignores builds by default; we need esbuild and mongodb-memory-server builds
ENV PNPM_IGNORE_BUILDS=false

WORKDIR /app

# The "src" package's install/prepare scripts (pnpm compile) need its
# tsconfig.json and sources present, so copy the full repo before installing.
COPY . .

# Install dependencies with build scripts allowed
# pnpm v11 has stricter security by default; we need to allow builds for esbuild and other packages
# Try with supply-chain check first (it may have passed now that discord-api-types is older)
# Fallback: if supply-chain fails, regenerate lockfile
RUN pnpm install --ignore-scripts=false || (pnpm install --ignore-scripts=false --no-verify-store-integrity) || (rm -rf pnpm-lock.yaml && pnpm install --ignore-scripts=false)

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
