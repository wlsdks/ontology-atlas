#!/usr/bin/env node
import http from "node:http";
import https from "node:https";

const DEFAULT_BASE_URL = "https://oh-my-ontology.web.app";
const DEFAULT_TIMEOUT_MS = 15000;

function printHelp() {
  console.log(`Usage: pnpm desktop:verify-hosted [--base-url=${DEFAULT_BASE_URL}] [--timeout-ms=${DEFAULT_TIMEOUT_MS}]

Verifies the deployed hosted website is the promo/download surface for the
macOS-first product path:
- /ko/ no longer presents the browser vault picker as the primary CTA
- /ko/download/ exists and points users to the GitHub Releases download path

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
    "next: ensure .github/workflows/deploy-hosting.yml is merged into the default branch,",
    "then run: gh workflow run deploy-hosting.yml --repo wlsdks/oh-my-ontology",
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
          "User-Agent": "oh-my-ontology-hosted-download-surface",
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

function assertIncludes(text, label, needles) {
  const missing = needles.filter((needle) => !text.includes(needle));
  if (missing.length > 0) {
    throw new Error(`${label} is missing expected text: ${missing.join(", ")}`);
  }
}

function assertExcludes(text, label, needles) {
  const present = needles.filter((needle) => text.includes(needle));
  if (present.length > 0) {
    throw new Error(`${label} still contains stale hosted-workbench text: ${present.join(", ")}`);
  }
}

export async function evaluateHostedSurface({ baseUrl, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const landingPath = "/ko/";
  const downloadPath = "/ko/download/";
  const [landing, download] = await Promise.all([
    requestText(`${baseUrl}${landingPath}`, { timeoutMs }),
    requestText(`${baseUrl}${downloadPath}`, { timeoutMs }),
  ]);

  assertOkPage(landing, landingPath);
  assertOkPage(download, downloadPath);

  const landingText = renderedText(landing.body);
  const downloadText = renderedText(download.body);
  const releasesUrl = "https://github.com/wlsdks/oh-my-ontology/releases";

  assertIncludes(landingText, landingPath, [
    "Context Atlas",
    "macOS-first ontology workbench",
    "macOS 앱 다운로드",
    "설치 안내 보기",
    "웹 사이트는 제품 소개와 다운로드 진입점입니다",
  ]);
  assertExcludes(landingText, landingPath, [
    "내 마크다운 폴더 열기",
    "데모 먼저 보기",
  ]);

  assertIncludes(downloadText, downloadPath, [
    "한 번 설치하고, 내 로컬 vault 에서 작업하세요",
    "macOS 릴리스 열기",
    "소스 코드 보기",
    "호스팅 웹 사이트는 vault 폴더를 열거나 편집하지 않습니다",
  ]);
  assertIncludes(landing.body, landingPath, [releasesUrl]);
  assertIncludes(download.body, downloadPath, [releasesUrl]);
  assertExcludes(`${landing.body}\n${download.body}`, "hosted pages", [
    "https://github.com/wlsdks/oh-my-ontology/releases/latest",
  ]);

  return {
    landingUrl: landing.url,
    downloadUrl: download.url,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  try {
    const report = await evaluateHostedSurface(options);
    console.log(`[hosted-download-surface] ${options.baseUrl} is promo/download aligned`);
    console.log(`landing: ${report.landingUrl}`);
    console.log(`download: ${report.downloadUrl}`);
  } catch (error) {
    const next = deploymentNextAction(error);
    fail(next ? `${error.message}\n${next}` : error.message);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
