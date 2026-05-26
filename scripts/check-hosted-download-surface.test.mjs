import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { evaluateHostedSurface } from "./check-hosted-download-surface.mjs";

function startServer(routes) {
  const server = http.createServer((request, response) => {
    const route = routes[request.url ?? ""];
    if (!route) {
      response.writeHead(404, { "content-type": "text/html" });
      response.end("not found");
      return;
    }
    response.writeHead(route.status ?? 200, { "content-type": route.contentType ?? "text/html" });
    response.end(route.body);
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        baseUrl: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

const alignedLanding = `<!doctype html>
<main>
  <p>macOS-first ontology workbench</p>
  <a href="https://github.com/wlsdks/oh-my-ontology/releases">macOS 앱 다운로드</a>
  <a href="/ko/download/">설치 안내 보기</a>
  <p>웹 사이트는 제품 소개와 다운로드 진입점입니다.</p>
</main>`;

const alignedDownload = `<!doctype html>
<main>
  <h1>한 번 설치하고, 내 로컬 vault 에서 작업하세요.</h1>
  <a href="https://github.com/wlsdks/oh-my-ontology/releases">macOS 릴리스 열기</a>
  <a href="https://github.com/wlsdks/oh-my-ontology">소스 코드 보기</a>
  <p>호스팅 웹 사이트는 vault 폴더를 열거나 편집하지 않습니다.</p>
</main>`;

test("hosted download surface check passes for promo/download-aligned pages", async () => {
  const server = await startServer({
    "/ko/": { body: alignedLanding },
    "/ko/download/": { body: alignedDownload },
  });
  try {
    const result = await evaluateHostedSurface({
      baseUrl: server.baseUrl,
      timeoutMs: 5000,
    });

    assert.equal(result.landingUrl, `${server.baseUrl}/ko/`);
    assert.equal(result.downloadUrl, `${server.baseUrl}/ko/download/`);
  } finally {
    await server.close();
  }
});

test("hosted download surface check rejects the stale browser vault CTA", async () => {
  const server = await startServer({
    "/ko/": {
      body: alignedLanding.replace("</main>", "<a>내 마크다운 폴더 열기</a></main>"),
    },
    "/ko/download/": { body: alignedDownload },
  });
  try {
    await assert.rejects(
      evaluateHostedSurface({
        baseUrl: server.baseUrl,
        timeoutMs: 5000,
      }),
      /내 마크다운 폴더 열기/,
    );

  } finally {
    await server.close();
  }
});

test("hosted download surface check rejects a missing download route", async () => {
  const server = await startServer({
    "/ko/": { body: alignedLanding },
  });
  try {
    await assert.rejects(
      evaluateHostedSurface({
        baseUrl: server.baseUrl,
        timeoutMs: 5000,
      }),
      /\/ko\/download\/ returned HTTP 404/,
    );

  } finally {
    await server.close();
  }
});
