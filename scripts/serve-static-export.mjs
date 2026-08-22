#!/usr/bin/env node
/**
 * Serves the built static export (`out/`) with **zero dependencies**.
 *
 * Why it exists: some e2e specs must measure a layer the dev server does not
 * have. Measured 2026-07-28, same-route navigation in the studio was dead only in
 * the production export (a `router.push` differing solely in query string was a
 * no-op), while dev succeeded on the same code — giving the dev server **zero
 * diagnostic power** for that defect. A gate that runs only against dev passes
 * that whole class of regression forever.
 *
 * Why not a package: adding `serve`/`http-server` puts one more dependency on the
 * release surface for the sake of one e2e. Routing for a `trailingSlash: true`
 * static site is one line ("a directory means `index.html`"), so it is not worth
 * it.
 *
 * Usage: `node scripts/serve-static-export.mjs [--port=4173] [--dir=out]`
 */
import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TYPES = new Map(
  Object.entries({
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
    ".xml": "application/xml; charset=utf-8",
  }),
);

function isInsideRoot(root, candidate) {
  const rel = path.relative(root, candidate);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}

async function resolveExistingInside(rootReal, candidate) {
  try {
    const candidateReal = await realpath(candidate);
    if (!isInsideRoot(rootReal, candidateReal)) return null;
    return { path: candidateReal, info: await stat(candidateReal) };
  } catch {
    return null;
  }
}

/** A directory means `index.html` — that is the whole routing of a `trailingSlash: true` export. */
export async function resolveStaticExportFile(rootPath, urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split("?")[0].split("#")[0]).replaceAll("\\", "/");
  } catch {
    return null;
  }

  const root = path.resolve(rootPath);
  let rootReal;
  try {
    rootReal = await realpath(root);
  } catch {
    return null;
  }

  const rootedUrl = decoded.startsWith("/") ? decoded : `/${decoded}`;
  const target = path.resolve(root, `.${rootedUrl}`);
  if (!isInsideRoot(root, target)) return null;

  const resolved = await resolveExistingInside(rootReal, target);
  if (resolved?.info.isDirectory()) {
    const index = await resolveExistingInside(rootReal, path.join(target, "index.html"));
    return index?.info.isFile() ? index.path : null;
  }
  if (resolved?.info.isFile()) return resolved.path;

  // An extensionless path also tries `<path>.html` — the export emits that form too.
  if (path.extname(target)) return null;
  const html = await resolveExistingInside(rootReal, `${target}.html`);
  return html?.info.isFile() ? html.path : null;
}

export function startStaticExportServer({ root, port, host = "127.0.0.1" }) {
  const resolvedRoot = path.resolve(root);
  const server = createServer(async (req, res) => {
    const file = await resolveStaticExportFile(resolvedRoot, req.url ?? "/");
    if (!file) {
      const notFound = await resolveStaticExportFile(resolvedRoot, "/404.html");
      if (notFound) {
        res.writeHead(404, { "content-type": TYPES.get(".html") });
        createReadStream(notFound).pipe(res);
        return;
      }
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("404");
      return;
    }
    res.writeHead(200, {
      "content-type": TYPES.get(path.extname(file)) ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    createReadStream(file).pipe(res);
  });
  server.listen(port, host, () => {
    const address = server.address();
    const actualPort = typeof address === "object" && address ? address.port : port;
    console.log(`[serve-static-export] ${resolvedRoot} → http://${host}:${actualPort}`);
  });
  return server;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = new Map(
    process.argv.slice(2).map((arg) => {
      const [key, value] = arg.replace(/^--/, "").split("=");
      return [key, value ?? "true"];
    }),
  );
  const port = Number(args.get("port") ?? 4173);
  const root = path.resolve(process.cwd(), args.get("dir") ?? "out");
  startStaticExportServer({ root, port });
}
