import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { evaluateHostedSurface } from "./check-hosted-download-surface.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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

// The root route hydrates client-side, so the static HTML this checker reads
// carries the product identity and little else. Asserting in-app CTAs here is
// what silently reddened every Pages deploy.
const alignedLanding = `<!doctype html>
<title>Ontology Atlas</title>
<main>
  <p>Ontology Atlas</p>
</main>`;

// The checker reads its expected copy from `messages/ko.json` precisely so a
// hand-copied string list cannot drift. A fixture that hand-copies the same
// strings reintroduces that drift one layer down — and did: the `/download`
// remake (2026-07-27) rewrote every sentence below, so this fixture started
// failing a checker that was working correctly. Build the fixture from the
// same catalog the checker reads.
const koDownloadCopy = JSON.parse(
  readFileSync(path.join(REPO_ROOT, "messages", "ko.json"), "utf8"),
).download;

const alignedDownload = `<!doctype html>
<main>
  <p>${koDownloadCopy.eyebrow}</p>
  <a href="https://github.com/wlsdks/ontology-atlas/releases">${koDownloadCopy.primaryCtaPending}</a>
  <a href="https://github.com/wlsdks/ontology-atlas">${koDownloadCopy.sourceCta}</a>
  <h2>${koDownloadCopy.windowsPlatformTitle}</h2>
  <p>${koDownloadCopy.platformStatus}</p>
  <a href="https://github.com/wlsdks/ontology-atlas/issues">${koDownloadCopy.windowsTrackCta}</a>
  <p>${koDownloadCopy.releaseGateNote}</p>
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

    assert.equal(result.rootUrl, `${server.baseUrl}/ko/`);
    assert.equal(result.downloadUrl, `${server.baseUrl}/ko/download/`);
  } finally {
    await server.close();
  }
});

test("hosted download surface check accepts the published unsigned Windows beta branch", async () => {
  const publishedDownload = alignedDownload
    .replace(`<p>${koDownloadCopy.platformStatus}</p>`, `<p>${koDownloadCopy.windowsUnsignedWarning}</p>`)
    .replace(
      `<a href="https://github.com/wlsdks/ontology-atlas/issues">${koDownloadCopy.windowsTrackCta}</a>`,
      `<a href="https://github.com/wlsdks/ontology-atlas/releases/download/v1/ontology-atlas_1_windows_x64-setup.exe">${koDownloadCopy.windowsDownloadCta}</a>`,
    );
  const server = await startServer({
    "/ko/": { body: alignedLanding },
    "/ko/download/": { body: publishedDownload },
  });
  try {
    await evaluateHostedSurface({ baseUrl: server.baseUrl, timeoutMs: 5000 });
  } finally {
    await server.close();
  }
});

test("hosted download surface check rejects a root page that lost the product identity", async () => {
  const server = await startServer({
    "/ko/": { body: alignedLanding.replace(/Ontology Atlas/g, "") },
    "/ko/download/": { body: alignedDownload },
  });
  try {
    await assert.rejects(
      evaluateHostedSurface({
        baseUrl: server.baseUrl,
        timeoutMs: 5000,
      }),
      /Ontology Atlas/,
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

// Windows visitors must be told where they stand. A download page that names
// only macOS reads as "this product is not for you" — the exact ambiguity the
// in-preparation card exists to remove.
test("hosted download surface check rejects a download page that drops the Windows platform status", async () => {
  const server = await startServer({
    "/ko/": { body: alignedLanding },
    "/ko/download/": {
      // ⚠️ 문자열을 여기 베끼지 않는다. 예전엔 `.replace("<h2>Windows</h2>", "")`
      // 였는데, 그 리터럴은 `messages/ko.json` 의 값이라 **문구를 고치는 순간
      // 아무것도 못 지운다.** 그러면 픽스처가 멀쩡한 채로 남아 검사는 통과하고,
      // 시험은 "떨어뜨렸는데 안 잡힌다" 며 빨개진다 — 실제로 2026-07-29 에
      // 정확히 그렇게 됐다. 이제 메시지에서 읽어 지운다.
      body: alignedDownload
        .replace(`<p>${koDownloadCopy.platformStatus}</p>`, "")
        .replace(
          `<a href="https://github.com/wlsdks/ontology-atlas/issues">${koDownloadCopy.windowsTrackCta}</a>`,
          "",
        ),
    },
  });
  try {
    await assert.rejects(
      evaluateHostedSurface({
        baseUrl: server.baseUrl,
        timeoutMs: 5000,
      }),
      /Windows/,
    );
  } finally {
    await server.close();
  }
});

/**
 * **탐지기가 스스로 무장 해제하지 않는지 본다** (2026-07-29 실측 사고).
 *
 * 검사 목록이 `messages/ko.json` 의 값으로 만들어지는데, 키가 리네임되면 그
 * 자리가 `undefined` 가 된다. 그런데 `String.includes(undefined)` 는 인자를
 * 리터럴 `"undefined"` 로 강제 변환하고, 페이지 템플릿도 같은 자리에
 * `undefined` 를 렌더한다 — **바늘과 짚더미가 같은 방식으로 틀려서 서로
 * 맞아떨어진다.** 검사는 초록으로 통과했고, Windows 안내가 사라져도 아무도
 * 몰랐을 것이다.
 *
 * 이 시험은 그 상태를 인위적으로 만든다. 통과하면(=거부하지 않으면) 탐지기가
 * 다시 무장 해제된 것이다.
 */
test("hosted download surface check rejects a renamed-away copy key instead of silently passing", async () => {
  const server = await startServer({
    "/ko/": { body: alignedLanding },
    // 검사가 요구하는 문구가 사라지고, 그 자리에 템플릿이 남긴 `undefined` 만
    // 있는 페이지 — 키를 지운 다음 배포하면 정확히 이 모양이 된다.
    "/ko/download/": {
      body: alignedDownload.replace(
        `<p>${koDownloadCopy.platformStatus}</p>`,
        "<p>undefined</p>",
      ),
    },
  });
  try {
    await assert.rejects(
      evaluateHostedSurface({ baseUrl: server.baseUrl, timeoutMs: 5000 }),
      /platformStatus|missing expected text|misconfigured|Windows/,
    );
  } finally {
    await server.close();
  }
});

test("hosted download surface check rejects unstable latest-release URLs", async () => {
  const server = await startServer({
    "/ko/": { body: alignedLanding },
    "/ko/download/": {
      body: alignedDownload.replace(
        "https://github.com/wlsdks/ontology-atlas/releases",
        "https://github.com/wlsdks/ontology-atlas/releases/latest",
      ),
    },
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
    assert.match(result.stderr, /deploy-pages\.yml is merged into the default branch/);
    assert.match(result.stderr, /gh workflow run deploy-pages\.yml --repo wlsdks\/ontology-atlas/);
    assert.match(result.stderr, /pnpm desktop:verify-hosted/);
  } finally {
    await server.close();
  }
});
