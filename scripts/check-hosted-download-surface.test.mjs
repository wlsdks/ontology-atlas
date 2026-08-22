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

// The deployed page must offer **something to decide** in any release state — a file
// if one is downloadable, otherwise the browser map that works today. A page with
// neither sends the visitor away empty-handed.
//
// Re-aimed 2026-08-19: the old version checked whether the Windows platform section
// had dropped, and that section disappeared along with the install section. What now
// carries the same "never send them away empty-handed" is the pair of
// release-state CTAs.
test("hosted download surface check rejects a download page with no release-state CTA", async () => {
  const server = await startServer({
    "/ko/": { body: alignedLanding },
    "/ko/download/": {
      // ⚠️ Do not copy the string here. Deleting by literal removes **nothing** the moment
      // the copy changes, leaving the fixture intact while only the test turns red (a real
      // incident, 2026-07-29). Read it from the messages and delete that.
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
 * **Checks that the detector does not disarm itself** (a real incident, 2026-07-29).
 *
 * The check list is built from values in `messages/ko.json`, so renaming a key makes
 * that slot `undefined`. `String.includes(undefined)` coerces its argument to the
 * literal `"undefined"`, and the page template renders `undefined` in the same slot —
 * **needle and haystack are wrong in the same way and therefore match.** The check
 * passed green, and the Windows guidance could have vanished with nobody knowing.
 *
 * This test creates that state deliberately. If it passes (i.e. does not reject), the
 * detector has disarmed itself again.
 */
test("hosted download surface check rejects a renamed-away copy key instead of silently passing", async () => {
  const server = await startServer({
    "/ko/": { body: alignedLanding },
    // A page where the copy the check requires is gone and only the template's
    // `undefined` remains — exactly what deploying after deleting the key produces.
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
