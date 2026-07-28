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
import { stat } from "node:fs/promises";
import path from "node:path";

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"];
  }),
);

const port = Number(args.get("port") ?? 4173);
const root = path.resolve(process.cwd(), args.get("dir") ?? "out");

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

/** 디렉토리면 `index.html` — `trailingSlash: true` export 의 라우팅 전부다. */
async function resolveFile(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0].split("#")[0]);
  const target = path.join(root, decoded);
  // 루트 밖으로 나가는 경로는 거절한다(`..` 순회).
  if (!target.startsWith(root)) return null;
  try {
    const info = await stat(target);
    if (info.isDirectory()) return resolveFile(path.posix.join(decoded, "index.html"));
    return target;
  } catch {
    // 확장자 없는 경로는 `<path>.html` 도 본다 — export 가 그렇게도 낸다.
    if (path.extname(target)) return null;
    try {
      await stat(`${target}.html`);
      return `${target}.html`;
    } catch {
      return null;
    }
  }
}

createServer(async (req, res) => {
  const file = await resolveFile(req.url ?? "/");
  if (!file) {
    const notFound = await resolveFile("/404.html");
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
}).listen(port, () => {
  console.log(`[serve-static-export] ${root} → http://127.0.0.1:${port}`);
});
