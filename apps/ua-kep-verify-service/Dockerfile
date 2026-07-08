# Standalone image for the UA KEP verification adapter service. The app has no
# workspace dependencies (hono, zod, fast-xml-parser only), so it builds
# independently of the VilnoEDO monorepo.
#
# Phase 2: to enable the iit-native engine, add the licensed IIT signature
# library into the image (or mount it as a volume) and set IIT_LIB_PATH. See
# src/engines/iit-native.README.md for the file set.
FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src

ENV NODE_ENV=production
ENV PORT=3017
EXPOSE 3017

# tsx runs the TypeScript entrypoint directly; no separate build step.
CMD ["npx", "tsx", "src/server.ts"]
