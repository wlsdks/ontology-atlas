/**
 * Contract for the installed app's [Settings → AI connection → connect by
 * address] flow.
 *
 * The one discipline this file keeps: **if it was not found, say it was not
 * found.** The failure mode that has burned this repository repeatedly is "the
 * element was never found, so violations are 0 and the check is green", so every
 * verdict here requires a *positive* fact — a missing marker is a failure, not a
 * pass. That is why each marker is tested with `!== true`; `?? true` and
 * "check only if present" are forbidden here.
 */

/** Ollama's default address. Same value as `src/shared/lib/tauri-secrets.ts`. */
export const AI_SETTINGS_DEFAULT_BASE_URL = "http://localhost:11434";

/**
 * Only this flow gets a wide marker-wait window — it is five clicks with a real
 * HTTP round trip in the middle. Widening the window is not the same as
 * softening the verdict.
 */
export const AI_SETTINGS_PAYLOAD_TIMEOUT_MS = 45000;

/**
 * Clock slack allowed when deciding whether an audit line belongs to this run.
 * The app writes its process's time while the verifier reads Node's, so the two
 * are not assumed to be the same clock.
 */
export const AI_SETTINGS_AUDIT_CLOCK_SLACK_MS = 5000;

/**
 * Row cap for list growth — must equal `LISTBOX_MAX_ROWS` in
 * `src/shared/ui/select-growth.ts`. The duplicate exists because this script does
 * not import the app bundle; if the two drift,
 * `scripts/verify-macos-app-launch.ai-settings.test.mjs` catches it.
 */
export const AI_SETTINGS_LISTBOX_MAX_ROWS = 8;

export function isSafeAiSettingsBaseUrl(value) {
  const url = String(value ?? "").trim();
  if (!url.startsWith("http://") && !url.startsWith("https://")) return false;
  if (url.length > 200) return false;
  // This travels into the WebView as a string literal, so characters that would
  // break the literal are rejected outright rather than escaped.
  return !/[\s"'`<>\\]/.test(url);
}

/**
 * Marker verdict — `null` on pass, otherwise a string naming **where it
 * stopped**.
 *
 * The failure string is the report a person reads, so it is phrased as "what
 * could not be done", not "what was missing".
 */
export function validateAiSettingsMarkers(markers, { expectedBaseUrl = null } = {}) {
  const run = markers?.aiSettingsVerification;
  if (!run || typeof run !== "object") {
    return "WebView never reported the AI settings verifier (missing aiSettingsVerification marker)";
  }
  if (run.attempted !== true) {
    return `WebView AI settings verifier did not start: ${run.reason || "unknown reason"}`;
  }
  if (run.bridgeMissing === true) {
    return "installed app rendered the web-degraded AI card; the desktop LLM bridge was unavailable";
  }
  if (markers.aiSettingsSheetOpen !== true) {
    return `WebView did not open the settings sheet (verifier stopped at ${run.step || "unknown step"}: ${run.reason || "unknown reason"})`;
  }
  if (markers.aiSettingsAiViewOpen !== true) {
    return `WebView did not reach the AI connection view (verifier stopped at ${run.step || "unknown step"}: ${run.reason || "unknown reason"})`;
  }
  if (run.localRowFound !== true) {
    return "WebView did not find the local/address provider row inside the AI connection view";
  }
  if (run.verifyClicked !== true) {
    return `WebView never pressed the local connection check: ${run.reason || "unknown reason"}`;
  }

  const observedBaseUrl = String(markers.aiSettingsBaseUrlValue ?? "").trim();
  const expected = String(expectedBaseUrl ?? "").trim();
  if (expected && observedBaseUrl !== expected) {
    return `WebView local base URL field held ${observedBaseUrl || "an empty value"}, expected ${expected}`;
  }

  // If there is failure text, **that text is the verdict**. Ollama being off
  // lands here — rather than passing silently, relay what the screen told the
  // user.
  const failure = String(markers.aiSettingsFailureText || run.failureText || "").trim();
  if (failure) {
    return `installed app reported a local runner failure at ${observedBaseUrl || expected || "the configured address"}: ${failure}`;
  }
  if (markers.aiSettingsVerifiedVisible !== true) {
    return `installed app never showed a successful local connection verdict (verifier stopped at ${run.step || "unknown step"}: ${run.reason || "unknown reason"})`;
  }

  const modelCount = Number(run.modelOptionCount);
  if (!Number.isFinite(modelCount) || modelCount < 1) {
    return "installed app verified the local runner but offered no model to choose";
  }
  // **"Choosable" includes being visible** (measured on the installed app
  // 2026-08-02). The old verdict stopped at `modelOptionCount >= 1` while on
  // screen an ancestor's `overflow: hidden` clipped a 264px list to 39px, showing
  // 1 of 7 — and every role, aria, and text marker still passed. Counted is not
  // the same as visible.
  const listHeight = Number(run.modelListHeight);
  const visibleHeight = Number(run.modelListVisibleHeight);
  if (!Number.isFinite(listHeight) || listHeight < 1) {
    return "WebView never measured the model list box (missing modelListHeight marker)";
  }
  if (!Number.isFinite(visibleHeight) || visibleHeight + 1 < listHeight) {
    return `installed app clipped the model list: ${visibleHeight}px of ${listHeight}px was on screen — an ancestor overflow is cutting the list, so ${modelCount} model(s) are announced but not all are reachable`;
  }
  const inView = Number(run.modelOptionsInView);
  const hittable = Number(run.modelOptionsHittable);
  if (!Number.isFinite(inView) || inView < 1) {
    return "installed app opened the model list but not one option landed inside its own scroll view";
  }
  if (!Number.isFinite(hittable) || hittable !== inView) {
    return `installed app showed ${inView} model option(s) but only ${Number.isFinite(hittable) ? hittable : 0} answered a hit test at their own centre — something is drawn over them or they are outside the window`;
  }
  // **Below the cap, the last item must be reachable.** If the common case
  // (7 measured runners ≤ the row cap) scrolls, the "there is more" affordance
  // lies and counted diverges from visible again. Scrolling is information only
  // above the cap.
  if (modelCount <= AI_SETTINGS_LISTBOX_MAX_ROWS && inView !== modelCount) {
    return `installed app had ${modelCount} model(s) — under the ${AI_SETTINGS_LISTBOX_MAX_ROWS}-row cap — but only showed ${inView} at once; the last one cannot be reached without scrolling a list that should not scroll`;
  }
  const overflowing = run.modelListOverflowing;
  if (typeof overflowing !== 'boolean') {
    return "WebView never reported whether the model list actually overflowed (missing modelListOverflowing marker)";
  }
  if (overflowing !== inView < modelCount) {
    return `installed app reported overflowing=${overflowing} while showing ${inView} of ${modelCount} model(s) — the scroll affordance and the real overflow disagree`;
  }

  const selectedModel = String(run.selectedModel ?? "").trim();
  if (!selectedModel) {
    return "WebView did not choose a model from the local runner list";
  }
  if (markers.aiSettingsConnectedVisible !== true) {
    return `installed app did not report the local connection as connected after choosing ${selectedModel}`;
  }
  const connectedText = String(markers.aiSettingsConnectedText ?? "");
  if (!connectedText.includes(selectedModel)) {
    return `installed app connected row read ${connectedText || "empty"}, which does not name the chosen model ${selectedModel}`;
  }
  if (run.reason !== "done") {
    return `WebView AI settings verifier stopped at ${run.step || "unknown step"}: ${run.reason || "unknown reason"}`;
  }
  return null;
}

/**
 * Verdict on the in-vault audit record — compares what the screen called success
 * against **the fact left on disk**. Screen markers alone cannot prove the call
 * actually went to that host (the audit record's host is never drawn into the
 * DOM).
 */
export function validateAiSettingsAuditTrail(lines, {
  since = 0,
  expectedHost = null,
  slackMs = AI_SETTINGS_AUDIT_CLOCK_SLACK_MS,
} = {}) {
  const entries = [];
  for (const raw of Array.isArray(lines) ? lines : String(lines ?? "").split("\n")) {
    const text = String(raw ?? "").trim();
    if (!text) continue;
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object") entries.push(parsed);
    } catch {
      // A malformed line is not this verdict's concern — if the line we want is
      // absent, the check below fails.
    }
  }

  const floor = Number(since) - Number(slackMs);
  const recent = entries.filter((entry) => {
    if (entry.provider !== "local" || entry.purpose !== "verify") return false;
    const at = Date.parse(String(entry.at ?? ""));
    return Number.isFinite(at) && at >= floor;
  });
  if (recent.length === 0) {
    return {
      error: `vault audit log has no local verify entry from this run (${entries.length} line(s) read)`,
      entry: null,
    };
  }

  const entry = recent[recent.length - 1];
  if (expectedHost && entry.host !== expectedHost) {
    return {
      error: `vault audit log recorded host ${entry.host ?? "null"}, expected ${expectedHost}`,
      entry,
    };
  }
  if (entry.outcome !== "ok") {
    return {
      error: `vault audit log recorded outcome ${entry.outcome ?? "missing"} (http ${entry.httpStatus ?? "none"}) for the local verify call`,
      entry,
    };
  }
  return { error: null, entry };
}

/** `http://localhost:11434/v1` → `localhost:11434`. Same rule as Rust's `host_of`. */
export function authorityOfBaseUrl(value) {
  const url = String(value ?? "").trim();
  const withoutScheme = url.includes("://") ? url.slice(url.indexOf("://") + 3) : url;
  const authority = withoutScheme.split(/[/?#]/)[0] ?? "";
  return authority;
}
