# The MCP server as a container image — the second npm-free distribution channel. It carries the
# Rust program `ontology-atlas-mcp`, built here from the `mcp-server` crate; there is no Node in it.
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
# manifest. Paths here are therefore repository-relative:
#
#   docker build -f mcp/Dockerfile -t ontology-atlas-mcp .
#
# A plain build produces one architecture — whichever the builder runs on, which an
# client on the other one cannot run. The published image must be built for both:
#
#   docker buildx build --platform linux/amd64,linux/arm64 -f mcp/Dockerfile \
#     -t ghcr.io/wlsdks/ontology-atlas-mcp:<version> --push .
#
# The server speaks stdio, so a client runs it with the vault mounted. Pass your
# own uid: the image runs as uid 1000, and on a Linux bind mount owned by another
# user a write would fail, or leave Markdown an agent writes owned by the wrong
# user inside your repository.
#
#   docker run --rm -i --user "$(id -u):$(id -g)" \
#     -v /path/to/atlas:/vault ghcr.io/wlsdks/ontology-atlas-mcp:latest
#
# `OATLAS_VAULT` defaults to /vault, and the server treats a folder with no nodes
# as empty rather than failing — an inspector with nothing mounted still gets a
# complete `tools/list`.
#
# Both stages are pinned by digest, so a moved tag cannot change what the published image is built
# from or runs on. Each index resolved 2026-11-28 (linux/amd64, linux/arm64); bump it on purpose,
# and the Rust tag together with `rust-toolchain.toml`.
FROM rust:1.100.0-alpine@sha256:8d0e82abfdf9a38071e07cabc5afba4ddbe077631a80e4e742a760c38beadc33 AS build

WORKDIR /src
# Alpine's Rust targets musl, so the program is one static file with no libc to match at run time.
COPY src-tauri/Cargo.toml src-tauri/Cargo.lock ./src-tauri/
COPY src-tauri/crates ./src-tauri/crates
COPY src-tauri/src ./src-tauri/src
COPY src-tauri/build.rs ./src-tauri/
RUN cargo build --release --locked -p mcp-server --manifest-path src-tauri/Cargo.toml \
 && install -D src-tauri/target/release/ontology-atlas-mcp-rust /out/ontology-atlas-mcp

FROM alpine:3.23@sha256:469c9ea410b9215eaee7976ba6c0639039b444be8e5d638f7abbada189971eb2

LABEL io.modelcontextprotocol.server.name="io.github.wlsdks/ontology-atlas"
LABEL org.opencontainers.image.title="Ontology Atlas MCP server"
LABEL org.opencontainers.image.description="Read and write one codebase ontology kept as Markdown in the repository."
LABEL org.opencontainers.image.source="https://github.com/wlsdks/ontology-atlas"
LABEL org.opencontainers.image.url="https://ontologyatlas.com"
LABEL org.opencontainers.image.licenses="MIT"

COPY --from=build /out/ontology-atlas-mcp /usr/local/bin/ontology-atlas-mcp
# The licence the labels and manifest both claim travels with the image.
COPY LICENSE /usr/share/licenses/ontology-atlas-mcp/LICENSE

ENV OATLAS_VAULT=/vault
VOLUME ["/vault"]

# Not root. A write tool creates Markdown and .ontology-atlas/activity.jsonl
# inside the mounted folder, and as root on a Linux bind mount those land
# root-owned in the user's repository. A host whose folder belongs to a
# different uid passes --user (see the header).
RUN adduser -D -u 1000 atlas
USER atlas

# stdio, not a port: the client owns the process lifetime. No EXPOSE, no daemon.
ENTRYPOINT ["/usr/local/bin/ontology-atlas-mcp"]
