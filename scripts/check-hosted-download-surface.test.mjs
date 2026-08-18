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
  <a href="https://github.com/wlsdks/ontology-atlas/releases">${koDownloadCopy.webCta}</a>
  <p>${koDownloadCopy.trustLine}</p>
  <h2>${koDownloadCopy.demoTitle}</h2>
  <h2>${koDownloadCopy.evidenceTitle}</h2>
  <h2>${koDownloadCopy.agentsTitle}</h2>
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

test("hosted download surface check accepts the published release branch", async () => {
  const publishedDownload = alignedDownload.replace(
    `<a href="https://github.com/wlsdks/ontology-atlas/releases">${koDownloadCopy.webCta}</a>`,
    `<a href="https://github.com/wlsdks/ontology-atlas/releases/download/v1/ontology-atlas_1_aarch64.dmg">${koDownloadCopy.primaryCtaPublished}</a>`,
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

// 배포된 페이지에는 어느 릴리스 상태에서든 **결정할 것**이 있어야 한다 —
// 받을 파일이 있으면 파일, 없으면 오늘 당장 되는 브라우저 지도. 둘 다 없는
// 페이지는 방문자를 빈손으로 돌려보낸다.
//
// [재조준 2026-08-19] 구 판본은 Windows 플랫폼 절이 떨어졌는지를 봤는데,
// 그 절이 설치 절과 함께 사라졌다. 같은 「빈손으로 돌려보내지 않는다」를
// 지금 지는 것은 릴리스 상태 두 갈래 CTA 다.
test("hosted download surface check rejects a download page with no release-state CTA", async () => {
  const server = await startServer({
    "/ko/": { body: alignedLanding },
    "/ko/download/": {
      // ⚠️ 문자열을 여기 베끼지 않는다. 리터럴로 지우면 문구를 고치는 순간
      // **아무것도 못 지우고**, 픽스처가 멀쩡한 채로 남아 시험만 빨개진다
      // (2026-07-29 실측 사고). 메시지에서 읽어 지운다.
      body: alignedDownload.replace(
        `<a href="https://github.com/wlsdks/ontology-atlas/releases">${koDownloadCopy.webCta}</a>`,
        `<a href="https://github.com/wlsdks/ontology-atlas/releases"></a>`,
      ),
    },
  });
  try {
    await assert.rejects(
      evaluateHostedSurface({
        baseUrl: server.baseUrl,
        timeoutMs: 5000,
      }),
      /Windows release-state text|missing expected text/,
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
        `<p>${koDownloadCopy.trustLine}</p>`,
        "<p>undefined</p>",
      ),
    },
  });
  try {
    await assert.rejects(
      evaluateHostedSurface({ baseUrl: server.baseUrl, timeoutMs: 5000 }),
      /trustLine|missing expected text|misconfigured/,
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
