import { sleep } from "./cli-args.mjs";
import { WEBVIEW_VERIFY_PREFIX, WEBVIEW_VERIFY_TIMEOUT_MS } from "./webview-env.mjs";

export function parseWebviewVerifyPayload(stdout) {
  const lines = stdout
    .split(/\r?\n/)
    .reverse()
    .filter((entry) => entry.startsWith(WEBVIEW_VERIFY_PREFIX));
  for (const line of lines) {
    const raw = line.slice(WEBVIEW_VERIFY_PREFIX.length).trim();
    if (!raw) continue;

    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed !== "string") return parsed;
      if (!parsed.trim()) continue;
      return JSON.parse(parsed);
    } catch {
      continue;
    }
  }
  return null;
}


export async function waitForWebviewVerifyPayload(readStdout, {
  timeoutMs = WEBVIEW_VERIFY_TIMEOUT_MS,
  intervalMs = 100,
  validatePayload = () => null,
} = {}) {
  const started = Date.now();
  let payload = parseWebviewVerifyPayload(readStdout());
  let validationError = payload ? validatePayload(payload) : "missing WebView verification payload";
  while ((!payload || validationError) && Date.now() - started < timeoutMs) {
    await sleep(intervalMs);
    payload = parseWebviewVerifyPayload(readStdout());
    validationError = payload ? validatePayload(payload) : "missing WebView verification payload";
  }
  return { payload, validationError };
}


export function markerNumber(markers, key) {
  const value = Number(markers?.[key]);
  return Number.isFinite(value) ? value : null;
}


export function markerText(markers, key) {
  const value = markers?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}


export function extractBackdropAlpha(background) {
  const value = String(background || "");
  const alpha = Number(
    value.match(/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([0-9.]+)\s*\)/)?.[1] ||
    value.match(/\/\s*([0-9.]+)\s*\)/)?.[1] ||
    "0",
  );
  return Number.isFinite(alpha) ? alpha : null;
}


export function evidenceRoute(href) {
  try {
    const url = new URL(href);
    return `${url.pathname}${url.search}`;
  } catch {
    return "";
  }
}

