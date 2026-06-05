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
  <p>Ontology Atlas</p>
  <p>macOS-first ontology workbench</p>
  <a href="https://github.com/wlsdks/ontology-atlas/releases">macOS 앱 다운로드</a>
  <a href="/ko/download/">설치 안내 보기</a>
  <p>웹 사이트는 제품 소개와 다운로드 진입점입니다.</p>
</main>`;

const alignedDownload = `<!doctype html>
<main>
  <h1>한 번 설치하고, 내 로컬 vault 에서 작업하세요.</h1>
  <a href="https://github.com/wlsdks/ontology-atlas/releases">macOS 릴리스 열기</a>
  <a href="https://github.com/wlsdks/ontology-atlas">소스 코드 보기</a>
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

test("hosted download surface check rejects a download page without the release CTA href", async () => {
  const server = await startServer({
    "/ko/": { body: alignedLanding },
    "/ko/download/": {
      body: alignedDownload.replace(
        "https://github.com/wlsdks/ontology-atlas/releases",
        "https://github.com/wlsdks/ontology-atlas",
      ),
    },
  });
  try {
    await assert.rejects(
      evaluateHostedSurface({
        baseUrl: server.baseUrl,
        timeoutMs: 5000,
      }),
      /\/ko\/download\/ is missing expected text: https:\/\/github\.com\/wlsdks\/ontology-atlas\/releases/,
    );
  } finally {
    await server.close();
  }
});

test("hosted download surface check rejects unstable latest-release URLs", async () => {
  const server = await startServer({
    "/ko/": {
      body: alignedLanding.replace(
        "https://github.com/wlsdks/ontology-atlas/releases",
        "https://github.com/wlsdks/ontology-atlas/releases/latest",
      ),
    },
    "/ko/download/": { body: alignedDownload },
  });
  try {
    await assert.rejects(
      evaluateHostedSurface({
        baseUrl: server.baseUrl,
        timeoutMs: 5000,
      }),
      /hosted pages still contains stale hosted-workbench text: https:\/\/github\.com\/wlsdks\/ontology-atlas\/releases\/latest/,
    );
  } finally {
    await server.close();
  }
});

test("hosted download surface CLI prints the deploy recovery path for live 404s", async () => {
  const server = await startServer({
    "/ko/": { body: alignedLanding },
  });
  try {
    const { spawn } = await import("node:child_process");
    const result = await new Promise((resolve) => {
      const child = spawn(process.execPath, [
        "scripts/check-hosted-download-surface.mjs",
        `--base-url=${server.baseUrl}`,
        "--timeout-ms=5000",
      ], {
        cwd: process.cwd(),
        encoding: "utf8",
      });
      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      child.on("close", (status) => {
        resolve({ status, stdout, stderr });
      });
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /\/ko\/download\/ returned HTTP 404/);
    assert.match(result.stderr, /deploy-hosting\.yml is merged into the default branch/);
    assert.match(result.stderr, /gh workflow run deploy-hosting\.yml --repo wlsdks\/ontology-atlas/);
    assert.match(result.stderr, /pnpm desktop:verify-hosted/);
  } finally {
    await server.close();
  }
});
