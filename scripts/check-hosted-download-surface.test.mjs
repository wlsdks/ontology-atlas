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
  <h1>${koDownloadCopy.title}</h1>
  <a href="https://github.com/wlsdks/ontology-atlas/releases">${koDownloadCopy.primaryCtaPending}</a>
  <a href="https://github.com/wlsdks/ontology-atlas">${koDownloadCopy.sourceCta}</a>
  <h2>${koDownloadCopy.macosHeading}</h2>
  <h2>${koDownloadCopy.windowsHeading}</h2>
  <span>${koDownloadCopy.windowsPendingBadge}</span>
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
      body: alignedDownload
        .replace("<h2>Windows</h2>", "")
        .replace("<span>준비 중</span>", ""),
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
