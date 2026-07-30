########################################
# Build stage: installs all prerequisites
# (pnpm, dependencies) and produces the
# production bundle from source.
########################################
FROM node:20-slim AS build

RUN npm install -g pnpm@10

# Run non-interactively so pnpm never blocks waiting for a confirmation prompt.
ENV CI=true

WORKDIR /app

# The "src" package's install/prepare scripts (pnpm compile) need its
# tsconfig.json and sources present, so copy the full repo before installing.
COPY . .
RUN pnpm install --frozen-lockfile

# Build the production bundle.
RUN pnpm run bundle

########################################
# Runtime stage: only the built bundle
# and a plain Node.js runtime, no build
# tools or source left in the image.
########################################
FROM node:20-slim AS runtime

WORKDIR /bot
COPY --from=build /app/dist/bundle.js* ./

WORKDIR /bot/cfg
CMD ["node", "--enable-source-maps", "/bot/bundle.js"]
