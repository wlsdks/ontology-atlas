#!/usr/bin/env node
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateHostedUpdaterManifest } from "./stage-hosted-updater-manifest.mjs";

// The expected copy is read from the shipped message catalog rather than
// duplicated here. A hand-copied string list is how this gate quietly went
// red: it kept asserting an owner-only checklist (hidden on the public build)
// and a CTA label that had since been reworded, so every Pages deploy failed
// verification while the site itself was fine. Sourcing the strings makes the
// contract "the page renders its own copy", which cannot drift.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const koMessages = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, "messages", "ko.json"), "utf8"),
);

const DEFAULT_BASE_URL = "https://wlsdks.github.io/ontology-atlas";
const DEFAULT_TIMEOUT_MS = 15000;

function printHelp() {
  console.log(`Usage: pnpm desktop:verify-hosted [--base-url=${DEFAULT_BASE_URL}] [--timeout-ms=${DEFAULT_TIMEOUT_MS}]

Verifies the deployed hosted website matches the root-first-open (2026-07)
product path:
- /ko/ renders the topology map itself (no marketing landing detour) and
  offers the local-folder open CTA directly — it does NOT stay promo-only
- /ko/download/ exists, states per-platform installability (macOS + Windows),
  and points users to the GitHub Releases download path

Only server-rendered text can be asserted: the root map hydrates client-side,
so its in-app CTAs are not in the static HTML this command reads.

This command checks deployed HTML only. It does not deploy or publish anything.
`);
}

function parseArgs(argv) {
  const options = {
    baseUrl: DEFAULT_BASE_URL,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };

  for (const arg of argv) {
    if (arg === "--") continue;
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    if (arg.startsWith("--base-url=")) {
      options.baseUrl = arg.slice("--base-url=".length).replace(/\/+$/, "");
      continue;
    }
    if (arg.startsWith("--timeout-ms=")) {
      const value = Number(arg.slice("--timeout-ms=".length));
      if (!Number.isFinite(value) || value <= 0) {
        fail(`--timeout-ms must be a positive number, got ${arg}`);
      }
      options.timeoutMs = value;
      continue;
    }
    fail(`unknown argument: ${arg}`);
  }

  try {
    const url = new URL(options.baseUrl);
    if (!["http:", "https:"].includes(url.protocol)) {
      fail("--base-url must use http or https.");
    }
  } catch {
    fail(`--base-url must be a valid URL, got ${options.baseUrl || "(empty)"}.`);
  }

  return options;
}

function fail(message) {
  console.error(`[hosted-download-surface] ${message}`);
  process.exit(1);
}

function deploymentNextAction(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (!/\/ko\/download\/ returned HTTP 404|\/ko\/ returned HTTP 404/.test(message)) {
    return null;
  }
  return [
    "next: ensure .github/workflows/deploy-pages.yml is merged into the default branch,",
    "then run: gh workflow run deploy-pages.yml --repo wlsdks/ontology-atlas",
    "after the workflow completes, rerun: pnpm desktop:verify-hosted",
  ].join(" ");
}

function requestText(url, { timeoutMs, redirects = 3 } = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === "https:" ? https : http;
    const request = client.get(
      parsed,
      {
        headers: {
          "User-Agent": "ontology-atlas-hosted-download-surface",
          Accept: "text/html,application/xhtml+xml",
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        const location = response.headers.location;
        if ([301, 302, 303, 307, 308].includes(status) && location && redirects > 0) {
          response.resume();
          resolve(requestText(new URL(location, parsed).toString(), { timeoutMs, redirects: redirects - 1 }));
          return;
        }

        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          resolve({
            url,
            status,
            contentType: String(response.headers["content-type"] ?? ""),
            body,
          });
        });
      },
    );

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`request timed out after ${timeoutMs}ms: ${url}`));
    });
    request.on("error", reject);
  });
}

function renderedText(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function assertOkPage(page, path) {
  if (page.status < 200 || page.status >= 300) {
    throw new Error(`${path} returned HTTP ${page.status}`);
  }
  if (page.contentType && !/text\/html|application\/xhtml\+xml/i.test(page.contentType)) {
    throw new Error(`${path} returned unexpected content-type ${page.contentType}`);
  }
}

function assertOkJson(page, path) {
  if (page.status < 200 || page.status >= 300) {
    throw new Error(`${path} returned HTTP ${page.status}`);
  }
  let value;
  try {
    value = JSON.parse(page.body);
  } catch (error) {
    throw new Error(`${path} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const version = typeof value?.version === "string" ? value.version : "";
  validateHostedUpdaterManifest(value, `v${version}`);
  return value;
}

/**
 * ⚠️ **A missing message key must fail loudly, not pass quietly.**
 *
 * `String.prototype.includes(undefined)` coerces its argument to the literal
 * `"undefined"`. So when a copy key was renamed away, this check did not just
 * stop guarding that string — it started guarding the *word* `undefined`, which
 * the page's own template happily renders in the same spot. The needle and the
 * haystack were both wrong in the same way, so they matched, and the guard
 * reported success (measured 2026-07-29: the Windows-platform assertion had
 * silently disarmed itself after `windowsHeading` / `windowsPendingBadge` were
 * replaced by `platformStatus` / `windowsTrackCta`).
 *
 * A guard that cannot tell "the page lost this text" from "nobody told me what
 * text to look for" is worse than no guard — it is a green light nobody earned.
 */
function assertIncludes(text, label, needles) {
  const unusable = needles.filter((needle) => typeof needle !== "string" || needle.length === 0);
  if (unusable.length > 0) {
    throw new Error(
      `${label} check is misconfigured: ${unusable.length} expected string(s) resolved to nothing ` +
        `(a renamed or deleted message key). Point the check at the current keys.`,
    );
  }
  const missing = needles.filter((needle) => !text.includes(needle));
  if (missing.length > 0) {
    throw new Error(`${label} is missing expected text: ${missing.join(", ")}`);
  }
}

function assertIncludesOneOf(text, label, needles) {
  const unusable = needles.filter((needle) => typeof needle !== "string" || needle.length === 0);
  if (unusable.length > 0) {
    throw new Error(`${label} check is misconfigured: a Windows release-state message is missing.`);
  }
  if (!needles.some((needle) => text.includes(needle))) {
    throw new Error(`${label} is missing every expected Windows release-state text.`);
  }
}

function assertExcludes(text, label, needles) {
  const present = needles.filter((needle) => text.includes(needle));
  if (present.length > 0) {
    throw new Error(`${label} still contains stale hosted-workbench text: ${present.join(", ")}`);
  }
}

export async function evaluateHostedSurface({ baseUrl, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const rootPath = "/ko/";
  const downloadPath = "/ko/download/";
  const updaterPath = "/update/latest.json";
  const [root, download, updater] = await Promise.all([
    requestText(`${baseUrl}${rootPath}`, { timeoutMs }),
    requestText(`${baseUrl}${downloadPath}`, { timeoutMs }),
    requestText(`${baseUrl}${updaterPath}`, { timeoutMs }),
  ]);

  assertOkPage(root, rootPath);
  assertOkPage(download, downloadPath);
  assertOkJson(updater, updaterPath);

  const rootText = renderedText(root.body);
  const downloadText = renderedText(download.body);
  const releasesUrl = "https://github.com/wlsdks/ontology-atlas/releases";

  // The root route hydrates the map client-side, so its INDEX panel CTAs
  // ("내 마크다운 폴더 열기") never appear in the static HTML. Asserting them
  // here is what kept this gate failing on every deploy. What the static
  // export genuinely guarantees for `/` is that the route exists, is HTML,
  // and carries the product identity.
  assertIncludes(rootText, rootPath, ["Ontology Atlas"]);

  const downloadCopy = koMessages.download ?? {};
  assertIncludes(downloadText, downloadPath, [
    // ⚠️ Needles must survive `renderedText()`, which collapses every run of
    // whitespace to one space. A string carrying `\n` (the headline does) can
    // never match after that, so the headline is deliberately NOT a needle —
    // the eyebrow names the platform and the product in one unbroken line.
    //
    // [재조준 2026-08-19] 구 바늘 셋(`sourceCta` · `windowsPlatformTitle` ·
    // `releaseGateNote`)은 전부 설치 절 안에 살았고 소유자가 그 절을 통째로
    // 걷어냈다(*"맨 마지막 이거는 없어도 될듯? 어차피 맨 위에 다 있어서"*).
    // 지금 이 페이지를 이루는 것은 네 절이므로 절마다 바늘 하나를 세운다 —
    // 한 절이 배포에서 통째로 빠지면 그 절의 바늘이 잡는다.
    downloadCopy.eyebrow,
    downloadCopy.demoTitle,
    downloadCopy.evidenceTitle,
    downloadCopy.agentsTitle,
    // 정직성 사실의 **마지막** 자리다. 검증 레일이 사라진 뒤 서명·공증·「서버로
    // 아무것도 안 보낸다」를 말하는 곳은 히어로 신뢰줄 한 줄뿐이라, 이 줄이
    // 배포에서 빠지면 페이지에 그 주장이 하나도 없게 된다.
    downloadCopy.trustLine,
  ]);
  // A deploy can legitimately sit on either side of the release-facts commit:
  // published offers the real file, pending offers the browser map instead.
  // Requiring one exact branch made the post-release Pages refresh fail by design.
  assertIncludesOneOf(downloadText, downloadPath, [
    downloadCopy.primaryCtaPublished,
    downloadCopy.webCta,
  ]);
  assertIncludes(download.body, downloadPath, [releasesUrl]);
  assertExcludes(`${root.body}\n${download.body}`, "hosted pages", [
    "https://github.com/wlsdks/ontology-atlas/releases/latest",
  ]);

  return {
    rootUrl: root.url,
    downloadUrl: download.url,
    updaterUrl: updater.url,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  try {
    const report = await evaluateHostedSurface(options);
    console.log(`[hosted-download-surface] ${options.baseUrl} matches the root-first-open contract`);
    console.log(`root: ${report.rootUrl}`);
    console.log(`download: ${report.downloadUrl}`);
    console.log(`updater: ${report.updaterUrl}`);
  } catch (error) {
    const next = deploymentNextAction(error);
    fail(next ? `${error.message}\n${next}` : error.message);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
