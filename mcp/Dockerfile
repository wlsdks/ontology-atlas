# The MCP server as a container image — the second npm-free distribution channel.
#
# Two consumers, one file:
#
#   1. The official MCP Registry accepts `registryType: "oci"`, verifying ownership
#      through the `io.modelcontextprotocol.server.name` label below. It must match
#      the `name` in `server.json` exactly.
#   2. Glama's directory builds a server from its Dockerfile, starts it, and
#      indexes the tools it advertises. Authoring this file is what keeps that
#      inspection from guessing at the project structure.
#
# **The build context is the repository root**, which is what an outside builder
# assumes. It was `mcp/` until 2026-09-11, and that is the shape the awesome-list
# bot's Glama requirement exposed: a directory that builds a server from its
# Dockerfile starts at the root, where `COPY package.json` would take the app's
# manifest and the build would die on a missing `CHANGELOG.md`. Paths here are
# therefore repository-relative:
#
#   docker build -f mcp/Dockerfile -t ontology-atlas-mcp .
#
# A plain build produces one architecture — measured arm64 on Apple silicon, which
# an amd64 client cannot run. The published image must be built for both:
#
#   docker buildx build --platform linux/amd64,linux/arm64 -f mcp/Dockerfile \
#     -t ghcr.io/wlsdks/ontology-atlas-mcp:<version> --push .
#
# The server speaks stdio, so a client runs it with the vault mounted. Pass your
# own uid: the image runs as root, and on a Linux bind mount that would leave the
# Markdown an agent writes root-owned inside your repository (measured `uid=0`;
# macOS remaps ownership and hides this).
#
#   docker run --rm -i --user "$(id -u):$(id -g)" \
#     -v /path/to/atlas:/vault ghcr.io/wlsdks/ontology-atlas-mcp:latest
#
# `OATLAS_VAULT` defaults to /vault, and the server treats a folder with no nodes
# as empty rather than failing — an inspector with nothing mounted still gets a
# complete `tools/list`.
# By digest, so a moved tag cannot change what the published image runs on. The
# multi-arch index resolved 2026-09-27 (linux/amd64, linux/arm64/v8); bump it on purpose.
FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1

LABEL io.modelcontextprotocol.server.name="io.github.wlsdks/ontology-atlas"
LABEL org.opencontainers.image.title="Ontology Atlas MCP server"
LABEL org.opencontainers.image.description="Read and write one codebase ontology kept as Markdown in the repository."
LABEL org.opencontainers.image.source="https://github.com/wlsdks/ontology-atlas"
LABEL org.opencontainers.image.url="https://ontologyatlas.com"
LABEL org.opencontainers.image.licenses="MIT"

WORKDIR /app

# The lockfile is copied first so a source-only change reuses the install layer.
COPY mcp/package.json mcp/pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile --prod

COPY mcp/src ./src
COPY mcp/scripts ./scripts
COPY mcp/README.md mcp/CHANGELOG.md ./
# The licence the labels and manifest both claim travels with the image.
COPY LICENSE ./

# The server's own test suites are 60 files the image has no runner for.
RUN rm -f src/*.test.mjs scripts/*.test.mjs

ENV OATLAS_VAULT=/vault
VOLUME ["/vault"]

# Not root. A write tool creates Markdown and .ontology-atlas/activity.jsonl
# inside the mounted folder, and as root on a Linux bind mount those land
# root-owned in the user's repository. `node:24-alpine` ships this user; a host
# whose folder belongs to a different uid passes --user (see the header).
USER node

# stdio, not a port: the client owns the process lifetime. No EXPOSE, no daemon.
ENTRYPOINT ["node", "/app/src/index.js"]
