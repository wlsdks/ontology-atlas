#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listLocales } from "../i18n/build-messages.mjs";
import { APP_FOLDER, APP_MANIFEST, SITE_FOLDER } from "../lib/web/built-folders.mjs";
import { routeKeys, scriptFilesFrom } from "../lib/web/vite-manifest.mjs";
import { appFolderProblems } from "./check-app-folder.mjs";

export const DESKTOP_SMOKE_LOCALES = listLocales();
/**
 * What the installed app embeds must carry every screen the person can open. The app is one document and
 * one bundle, so a screen is a route module the manifest lists, and its meaning is a marker the module's
 * chunks hold, among the ones it loads on demand too.
 */
export const DESKTOP_SMOKE_APP_ROUTES = {
  "/docs": "src/app/routes/$locale/_app/docs",
  "/ontology": "src/app/routes/$locale/_app/ontology/index",
  "/topology": "src/app/routes/$locale/_app/topology",
  "/ontology/edit": "src/app/routes/$locale/_app/ontology/edit",
  "/ontology/insights": "src/app/routes/$locale/_app/ontology/insights",
};
/** The website's own page, smoked in the site folder; the app folder leaves it out of its screens. */
export const DESKTOP_SMOKE_SITE_ROUTE = "/download";
export const DESKTOP_SMOKE_ROOT_ENTRY = "index.html";
/** What the website host serves beside its pages. */
export const DESKTOP_SMOKE_SITE_FILES = ["404.html", "sitemap.xml", "robots.txt", "llms.txt", "llms-full.txt"];
export const DESKTOP_SMOKE_THIRD_PARTY_LICENSES = "third-party-licenses.txt";

// The website's title is the landing title, not a page title with the site name after it. Follow the
// page's metadata so the check cannot demand a retired title.
export function resolveDownloadTitles({ root = process.cwd(), locales = DESKTOP_SMOKE_LOCALES } = {}) {
  if (locales.length === 0) throw new Error("Download title inventory requires at least one locale");
  return Object.fromEntries(locales.map((locale) => {
    const { metadata } = JSON.parse(fs.readFileSync(path.join(root, "messages", `${locale}.json`), "utf8"));
    if (typeof metadata?.homeTitle !== "string" || !metadata.homeTitle.trim()) {
      throw new Error(`Missing route metadata for ${locale}:${DESKTOP_SMOKE_SITE_ROUTE} (metadata.homeTitle)`);
    }
    return [locale, metadata.homeTitle];
  }));
}

/**
 * Server-rendered copy is required only where it is the static product surface; client workbenches
 * are covered by the route markers below. The copy is read from the message catalogue, never pinned:
 * a deleted key stops `resolveRouteText` at once.
 */
export const DESKTOP_SMOKE_ROUTE_TEXT_KEYS = {
  // `eyebrow` is one line (the hero's `stageTitle` has a line break, so its rendered text differs
  // from the source). Both keys render in every release state.
  "/download": [
    "download.eyebrow",
    "download.screens.title",
  ],
};

function messageAtPath(messages, dottedKey) {
  return dottedKey
    .split(".")
    .reduce((node, part) => (node && typeof node === "object" ? node[part] : undefined), messages);
}

/**
 * Reads the catalogue and expands it into `"<locale>:<route>"` → expected copy.
 *
 * Copy containing an ICU placeholder (`{tag}`) renders differently from its source,
 * so such keys must not be chosen — choosing one stops here.
 */
export function resolveRouteText({
  root = process.cwd(),
  locales = DESKTOP_SMOKE_LOCALES,
  keysByRoute = DESKTOP_SMOKE_ROUTE_TEXT_KEYS,
} = {}) {
  const resolved = {};
  for (const locale of locales) {
    const catalogPath = path.join(root, "messages", `${locale}.json`);
    const messages = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
    for (const [route, keys] of Object.entries(keysByRoute)) {
      resolved[`${locale}:${route}`] = keys.map((key) => {
        const value = messageAtPath(messages, key);
        if (typeof value !== "string" || value.length === 0) {
          throw new Error(
            `desktop smoke copy contract points at ${locale} message "${key}", which no longer exists. ` +
              "Point DESKTOP_SMOKE_ROUTE_TEXT_KEYS at a message the route still renders.",
          );
        }
        if (/[{}]/.test(value)) {
          throw new Error(
            `desktop smoke copy contract picked ${locale} message "${key}", which carries an ICU placeholder ` +
              `(${value}). The rendered HTML never contains the raw string — pick a placeholder-free message.`,
          );
        }
        return value;
      });
    }
  }
  return resolved;
}

/**
 * Stable source markers stating what each packaged route means; they prove the bundle holds the live
 * route implementation. The website's page is measured in the site folder's chunks.
 */
export const DESKTOP_SMOKE_ROUTE_CHUNK_TEXT = {
  // A marker must say what this route is today. Retired marker names are not written here: the
  // contract test reads this file as text and would flag them.
  "/download": [
    "gateway-hero-cta",
    "gateway-demo-section",
    "gateway-screens-section",
  ],
  "/docs": [
    "data-docs-header-zone",
    "data-docs-viewer",
    "sourceContract.filesLabel",
    "sourceContract.graphLabel",
    "sourceContract.agentLabel",
  ],
  "/ontology": ["/topology/?", "index", "expanded"],
  "/topology": ["ontology-map-canvas", "topology-concept-search"],
  "/ontology/edit": ["/topology/?p=", "/topology/?workbench=create"],
  "/ontology/insights": ["/library/?tab=wiki", "/architecture/?"],
};

function existsUnder(root, relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function readTextUnder(root, relativePath) {
  const filePath = path.join(root, relativePath);
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : null;
}

const escapeHtml = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function hasAllText(text, fragments) {
  return fragments.every((fragment) => text.includes(fragment));
}

/** Every script of a folder's `assets/`, joined: the site's one bundle serves every page, so a marker is read across it. */
function readAllScripts(folder) {
  const assets = path.join(folder, "assets");
  if (!fs.existsSync(assets)) return "";
  return fs
    .readdirSync(assets)
    .filter((name) => name.endsWith(".js"))
    .map((name) => fs.readFileSync(path.join(assets, name), "utf8"))
    .join("\n");
}

/** What a route module's chunks hold, including the ones it loads on demand and what those import. */
function readRouteChunkText(appDir, manifest, routeSource) {
  const files = scriptFilesFrom(manifest, routeKeys(manifest, routeSource), { dynamic: true });
  return files.map((file) => readTextUnder(appDir, file) ?? "").join("\n");
}

function isMissingBuildArtifact(check) {
  return (
    check.id === "app-dir" ||
    check.id === "site-dir" ||
    check.id === "assets" ||
    check.id === "manifest" ||
    check.id === "root-entry" ||
    check.id === "third-party-licenses" ||
    check.id.startsWith("route:") ||
    check.id.startsWith("site-file:")
  );
}

export function evaluateDesktopSmoke({
  root = process.cwd(),
  appDir = path.join(root, APP_FOLDER),
  siteDir = path.join(root, SITE_FOLDER),
  manifestPath = path.join(root, APP_MANIFEST),
  locales = DESKTOP_SMOKE_LOCALES,
  appRoutes = DESKTOP_SMOKE_APP_ROUTES,
  downloadTitles,
  routeText,
  routeChunkText = {},
} = {}) {
  const expectedTitles = downloadTitles ?? resolveDownloadTitles({ root, locales });
  const expectedRouteText = routeText ?? resolveRouteText({ root, locales });
  const checks = [];
  const addCheck = (id, label, ok, details = "") => {
    checks.push({ id, label, ok, details });
  };

  addCheck("app-dir", "the app folder exists", fs.existsSync(appDir), appDir);
  addCheck("assets", "packaged app assets exist", existsUnder(appDir, "assets"), "assets");
  addCheck("root-entry", "Tauri app root entry exists", existsUnder(appDir, DESKTOP_SMOKE_ROOT_ENTRY), DESKTOP_SMOKE_ROOT_ENTRY);

  // The first frames of the installed app: the loading picture in every language is in the document itself.
  const document = readTextUnder(appDir, DESKTOP_SMOKE_ROOT_ENTRY) ?? "";
  for (const locale of locales) {
    const words = JSON.parse(fs.readFileSync(path.join(root, "messages", locale, "mapEntry.json"), "utf8"));
    const expected = [words.mapComing, words.loadingDetail].map(escapeHtml);
    addCheck(
      `loading-picture:${locale}`,
      `${locale} loading picture words are in the app document`,
      hasAllText(document, expected),
      expected.join(", "),
    );
  }

  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : null;
  addCheck("manifest", "the app build's manifest exists", manifest !== null, manifestPath);
  if (manifest) {
    for (const [route, source] of Object.entries(appRoutes)) {
      const expectedChunkText = routeChunkText[route];
      if (!expectedChunkText) continue;
      let chunkText = "";
      try {
        chunkText = readRouteChunkText(appDir, manifest, source);
      } catch {
        // A route module the manifest lacks is a missing marker below, not a crash.
      }
      addCheck(
        `route-chunk-text:${route}`,
        `${route} current component contract is bundled in the app`,
        hasAllText(chunkText, expectedChunkText),
        expectedChunkText.join(", "),
      );
    }
  }

  addCheck(
    "third-party-licenses",
    "the third-party license texts ship in the app folder",
    existsUnder(appDir, DESKTOP_SMOKE_THIRD_PARTY_LICENSES),
    DESKTOP_SMOKE_THIRD_PARTY_LICENSES,
  );
  const problems = fs.existsSync(appDir) ? appFolderProblems(appDir) : [];
  addCheck("app-folder-contents", "the app folder holds only what the app uses", problems.length === 0, [...problems.slice(0, 3), ...(problems.length > 3 ? [`${problems.length - 3} more`] : [])].join("; "));

  // The website's side: its own page and files, in the folder the host serves.
  addCheck("site-dir", "the site folder exists", fs.existsSync(siteDir), siteDir);
  const downloadScripts = readAllScripts(siteDir);
  for (const locale of locales) {
    const relativePath = path.join(locale, DESKTOP_SMOKE_SITE_ROUTE.slice(1), "index.html");
    const html = readTextUnder(siteDir, relativePath);
    addCheck(`route:${locale}:${DESKTOP_SMOKE_SITE_ROUTE}`, `${locale}${DESKTOP_SMOKE_SITE_ROUTE} page exists in the site folder`, html !== null, relativePath);
    addCheck(
      `route-title:${locale}:${DESKTOP_SMOKE_SITE_ROUTE}`,
      `${locale}${DESKTOP_SMOKE_SITE_ROUTE} page title matches`,
      typeof html === "string" && html.includes(`<title>${expectedTitles[locale]}</title>`),
      expectedTitles[locale],
    );
    const expectedText = expectedRouteText[`${locale}:${DESKTOP_SMOKE_SITE_ROUTE}`];
    addCheck(
      `route-text:${locale}:${DESKTOP_SMOKE_SITE_ROUTE}`,
      `${locale}${DESKTOP_SMOKE_SITE_ROUTE} current handoff copy is in the page`,
      typeof html === "string" && hasAllText(html, expectedText),
      expectedText.join(", "),
    );
  }
  const downloadMarkers = routeChunkText[DESKTOP_SMOKE_SITE_ROUTE];
  if (downloadMarkers) {
    addCheck(
      `route-chunk-text:${DESKTOP_SMOKE_SITE_ROUTE}`,
      `${DESKTOP_SMOKE_SITE_ROUTE} current component contract is bundled in the site`,
      hasAllText(downloadScripts, downloadMarkers),
      downloadMarkers.join(", "),
    );
  }
  for (const file of DESKTOP_SMOKE_SITE_FILES) {
    addCheck(`site-file:${file}`, `${file} is written for the website host`, existsUnder(siteDir, file), file);
  }

  const missing = checks.filter((check) => !check.ok);
  const missingBuildArtifact = missing.some(isMissingBuildArtifact);
  return {
    ok: missing.length === 0,
    checks,
    missing,
    blockerKind:
      missing.length === 0
        ? null
        : missingBuildArtifact
          ? "missing-build-artifact"
          : "static-contract-drift",
    nextAction:
      missing.length === 0
        ? "Run pnpm desktop:dev or pnpm desktop:build, then smoke the same routes inside the .app shell."
        : missingBuildArtifact
          ? "Run pnpm build before pnpm desktop:smoke so the app folder and the site folder hold every current artifact."
          : "Contract drift: compare the failing title, copy, component marker or stray file with the current route source; update the product or this smoke contract, then rebuild once.",
  };
}

function renderDesktopSmoke(report) {
  const lines = ["[desktop-smoke] packaged app and website smoke"];
  for (const check of report.checks) {
    lines.push(
      `${check.ok ? "✓" : "✗"} ${check.label}${check.details ? ` (${check.details})` : ""}`,
    );
  }
  lines.push(`[desktop-smoke] ${report.ok ? "ready" : "blocked"}: ${report.nextAction}`);
  return lines.join("\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = evaluateDesktopSmoke({
    routeChunkText: DESKTOP_SMOKE_ROUTE_CHUNK_TEXT,
  });
  console.log(renderDesktopSmoke(report));
  if (!report.ok) process.exitCode = 1;
}
