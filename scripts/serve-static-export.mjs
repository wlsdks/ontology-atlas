#!/usr/bin/env node
/**
 * 빌드된 정적 export(`out/`)를 서빙한다 — **의존성 0**.
 *
 * 왜 필요한가: dev 서버에는 없는 층을 재야 하는 e2e 스펙이 있다. 2026-07-28
 * 실측으로 공방의 같은-라우트 이동이 프로덕션 export 에서만 죽어 있었는데
 * (경로가 같고 쿼리만 다른 `router.push` 가 no-op), dev 는 같은 코드로 둘 다
 * 성공해 **그 결함에 대해 진단력이 0** 이었다. dev 에서만 도는 게이트는 그
 * 부류의 회귀를 영원히 통과시킨다.
 *
 * 왜 패키지를 안 쓰나: `serve`/`http-server` 를 넣으면 e2e 하나 때문에 배포
 * 표면에 의존성이 하나 는다. `trailingSlash: true` 정적 사이트의 라우팅은
 * "디렉토리면 `index.html`" 한 줄이면 끝나므로 값이 안 맞는다.
 *
 * 사용: `node scripts/serve-static-export.mjs [--port=4173] [--dir=out]`
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

/** 디렉토리면 `index.html` — `trailingSlash: true` export 의 라우팅 전부다. */
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

  // 확장자 없는 경로는 `<path>.html` 도 본다 — export 가 그렇게도 낸다.
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
