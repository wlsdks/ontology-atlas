/**
 * 설치 앱의 [설정 → AI 연결 → 주소로 연결] 흐름 계약.
 *
 * 이 파일이 지키는 단 하나의 규율: **못 찾았으면 못 찾았다고 말한다.**
 * 이 저장소가 여러 번 데인 실패 모드가 "요소를 못 찾았는데 위반 0으로
 * 초록" 이라서, 여기의 모든 판정은 *긍정 사실*을 요구한다 — 마커가 없으면
 * 통과가 아니라 실패다. 마커 하나하나가 `!== true` 로 걸리는 이유가 그것이다
 * (`?? true` 나 "있으면 검사" 는 여기서 금지다).
 */

/** Ollama 의 기본 주소. `src/shared/lib/tauri-secrets.ts` 와 같은 값. */
export const AI_SETTINGS_DEFAULT_BASE_URL = "http://localhost:11434";

/**
 * 이 흐름만 마커 대기 창을 넓게 잡는다 — 클릭이 다섯 단계이고 그 사이에 실제
 * HTTP 왕복이 하나 있다. 창을 넓히는 것과 판정을 무르게 하는 것은 다르다.
 */
export const AI_SETTINGS_PAYLOAD_TIMEOUT_MS = 45000;

/**
 * 감사 줄이 이 실행의 것인지 판정할 때 허용하는 시계 오차. 앱이 쓰는 시각은
 * 앱 프로세스의 것이고 검증기가 재는 시각은 Node 의 것이라, 정확히 같은
 * 시계라고 가정하지 않는다.
 */
export const AI_SETTINGS_AUDIT_CLOCK_SLACK_MS = 5000;

export function isSafeAiSettingsBaseUrl(value) {
  const url = String(value ?? "").trim();
  if (!url.startsWith("http://") && !url.startsWith("https://")) return false;
  if (url.length > 200) return false;
  // WebView 안에서 문자열 리터럴로 실려 가므로, 리터럴을 깨는 문자는 값 자체를
  // 거절한다 — 이스케이프에 기대지 않는다.
  return !/[\s"'`<>\\]/.test(url);
}

/**
 * 마커 판정 — 통과면 `null`, 아니면 **어디서 멈췄는지**를 말하는 문자열.
 *
 * 실패 문자열이 그대로 사람에게 보이는 보고서라, "무엇이 없었나" 가 아니라
 * "무엇을 못 했나" 로 쓴다.
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

  // 실패 문구가 있으면 **그 문구가 결론이다**. Ollama 가 꺼져 있는 경우가
  // 여기로 온다 — 조용히 통과시키지 않고 화면이 사람에게 한 말을 그대로 옮긴다.
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
 * 볼트 안 감사 기록 판정 — 화면이 성공이라고 말한 것과 **디스크에 남은 사실**이
 * 같은지 본다. 화면 마커만으로는 "호출이 실제로 그 호스트로 나갔다"를 증명하지
 * 못한다(감사 기록은 DOM 에 호스트를 그리지 않는다).
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
      // 깨진 줄은 이 판정의 대상이 아니다 — 우리가 찾는 줄이 없으면 아래에서
      // 실패한다.
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

/** `http://localhost:11434/v1` → `localhost:11434`. Rust `host_of` 와 같은 판정. */
export function authorityOfBaseUrl(value) {
  const url = String(value ?? "").trim();
  const withoutScheme = url.includes("://") ? url.slice(url.indexOf("://") + 3) : url;
  const authority = withoutScheme.split(/[/?#]/)[0] ?? "";
  return authority;
}
