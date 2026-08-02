import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  AI_SETTINGS_LISTBOX_MAX_ROWS,
  authorityOfBaseUrl,
  isSafeAiSettingsBaseUrl,
  parseVerifyAppLaunchArgs,
  validateAiSettingsAuditTrail,
  validateAiSettingsMarkers,
  webviewVerifyEnvPatch,
} from "./verify-macos-app-launch.mjs";

const PASSING_MARKERS = {
  aiSettingsSheetOpen: true,
  aiSettingsAiViewOpen: true,
  aiSettingsBaseUrlValue: "http://localhost:11434",
  aiSettingsVerifiedVisible: true,
  aiSettingsFailureText: "",
  aiSettingsConnectedVisible: true,
  aiSettingsConnectedText: "연결됨 qwen3:8b",
  aiSettingsAuditRowCount: 1,
  aiSettingsVerification: {
    attempted: true,
    reason: "done",
    step: "pick-model",
    localRowFound: true,
    verifyClicked: true,
    modelListOpened: true,
    modelOptionCount: 7,
    models: ["qwen3:8b"],
    // 목록이 잘리지 않고, 보인다고 주장하는 옵션이 전부 눌리고,
    // 행 상한 아래라 스크롤이 아예 없다.
    modelListHeight: 259,
    modelListVisibleHeight: 259,
    modelListOverflowing: false,
    modelOptionsInView: 7,
    modelOptionsHittable: 7,
    selectedModel: "qwen3:8b",
  },
};

test("AI settings markers pass only when the whole flow left positive proof", () => {
  assert.equal(
    validateAiSettingsMarkers(PASSING_MARKERS, {
      expectedBaseUrl: "http://localhost:11434",
    }),
    null,
  );
});

test("AI settings verification fails loudly instead of passing on missing elements", () => {
  // 이 저장소가 여러 번 데인 실패 모드 — 못 찾았는데 「위반 0」 으로 초록.
  const cases = [
    [{}, /never reported the AI settings verifier/],
    [
      { aiSettingsVerification: { attempted: false, reason: "env missing" } },
      /did not start: env missing/,
    ],
    [
      {
        ...PASSING_MARKERS,
        aiSettingsSheetOpen: false,
      },
      /did not open the settings sheet/,
    ],
    [
      {
        ...PASSING_MARKERS,
        aiSettingsAiViewOpen: false,
      },
      /did not reach the AI connection view/,
    ],
    [
      {
        ...PASSING_MARKERS,
        aiSettingsVerification: { ...PASSING_MARKERS.aiSettingsVerification, localRowFound: false },
      },
      /no local\/address row|did not find the local\/address provider row/,
    ],
    [
      {
        ...PASSING_MARKERS,
        aiSettingsVerification: { ...PASSING_MARKERS.aiSettingsVerification, verifyClicked: false },
      },
      /never pressed the local connection check/,
    ],
    [
      {
        ...PASSING_MARKERS,
        aiSettingsVerifiedVisible: false,
        aiSettingsFailureText: "연결되지 않았어요 — localhost:11434 이 응답하지 않아요.",
      },
      /reported a local runner failure at http:\/\/localhost:11434/,
    ],
    [
      {
        ...PASSING_MARKERS,
        aiSettingsVerifiedVisible: false,
      },
      /never showed a successful local connection verdict/,
    ],
    [
      {
        ...PASSING_MARKERS,
        aiSettingsVerification: {
          ...PASSING_MARKERS.aiSettingsVerification,
          modelOptionCount: 0,
          selectedModel: "",
        },
      },
      /offered no model to choose/,
    ],
    // 2026-08-02 설치 앱 실측 — **세는 것과 보이는 것은 다르다.** 러너가 준
    // 7개가 role/aria/텍스트 마커를 전부 통과하는 동안 화면에는 1개만 있었다
    // (264px 목록이 조상 overflow 에 39px 로 잘렸다). 종전 판정은 여기서
    // 초록이었고, 그래서 이 결함은 어느 게이트에도 안 걸렸다.
    [
      {
        ...PASSING_MARKERS,
        aiSettingsVerification: {
          ...PASSING_MARKERS.aiSettingsVerification,
          modelListHeight: 264,
          modelListVisibleHeight: 39,
        },
      },
      /clipped the model list: 39px of 264px/,
    ],
    [
      {
        ...PASSING_MARKERS,
        aiSettingsVerification: {
          ...PASSING_MARKERS.aiSettingsVerification,
          modelListHeight: undefined,
          modelListVisibleHeight: undefined,
        },
      },
      /never measured the model list box/,
    ],
    [
      {
        ...PASSING_MARKERS,
        aiSettingsVerification: {
          ...PASSING_MARKERS.aiSettingsVerification,
          modelOptionsHittable: 1,
        },
      },
      /showed 7 model option\(s\) but only 1 answered a hit test/,
    ],
    [
      {
        ...PASSING_MARKERS,
        aiSettingsVerification: {
          ...PASSING_MARKERS.aiSettingsVerification,
          modelOptionsInView: 0,
          modelOptionsHittable: 0,
        },
      },
      /not one option landed inside its own scroll view/,
    ],
    // 상한 규칙 — 7개는 행 상한(8) 아래이므로 한 번에 다 보여야 하고,
    // 스크롤은 «더 있다» 를 뜻하므로 그때 켜져 있으면 거짓말이다.
    [
      {
        ...PASSING_MARKERS,
        aiSettingsVerification: {
          ...PASSING_MARKERS.aiSettingsVerification,
          modelOptionsInView: 6,
          modelOptionsHittable: 6,
        },
      },
      /under the 8-row cap.*only showed 6 at once/,
    ],
    [
      {
        ...PASSING_MARKERS,
        aiSettingsVerification: {
          ...PASSING_MARKERS.aiSettingsVerification,
          modelListOverflowing: true,
        },
      },
      /overflowing=true while showing 7 of 7/,
    ],
    [
      {
        ...PASSING_MARKERS,
        aiSettingsVerification: {
          ...PASSING_MARKERS.aiSettingsVerification,
          modelListOverflowing: undefined,
        },
      },
      /never reported whether the model list actually overflowed/,
    ],
    [
      {
        ...PASSING_MARKERS,
        aiSettingsConnectedVisible: false,
      },
      /did not report the local connection as connected/,
    ],
    [
      {
        ...PASSING_MARKERS,
        aiSettingsConnectedText: "연결됨 gemma4:12b",
      },
      /does not name the chosen model qwen3:8b/,
    ],
    [
      {
        ...PASSING_MARKERS,
        aiSettingsVerification: {
          ...PASSING_MARKERS.aiSettingsVerification,
          reason: "gave up at pick-model",
        },
      },
      /stopped at pick-model/,
    ],
    [
      {
        ...PASSING_MARKERS,
        aiSettingsVerification: { attempted: true, bridgeMissing: true, reason: "web degraded" },
      },
      /web-degraded AI card/,
    ],
  ];

  for (const [markers, pattern] of cases) {
    const error = validateAiSettingsMarkers(markers, {
      expectedBaseUrl: "http://localhost:11434",
    });
    assert.match(String(error), pattern);
  }
});

test("AI settings markers reject a base URL the verifier never actually typed", () => {
  assert.match(
    String(
      validateAiSettingsMarkers(
        { ...PASSING_MARKERS, aiSettingsBaseUrlValue: "http://localhost:1234" },
        { expectedBaseUrl: "http://localhost:11434" },
      ),
    ),
    /held http:\/\/localhost:1234, expected http:\/\/localhost:11434/,
  );
});

test("AI settings audit trail requires a fresh local verify line pointed at the same host", () => {
  const now = Date.parse("2026-08-01T04:00:00.000Z");
  const line = (overrides) =>
    JSON.stringify({
      v: 1,
      at: new Date(now + 1000).toISOString(),
      provider: "local",
      host: "localhost:11434",
      purpose: "verify",
      outcome: "ok",
      httpStatus: 200,
      ...overrides,
    });

  assert.equal(
    validateAiSettingsAuditTrail([line({})], {
      since: now,
      expectedHost: "localhost:11434",
    }).error,
    null,
  );

  assert.match(
    String(validateAiSettingsAuditTrail([], { since: now }).error),
    /no local verify entry from this run/,
  );

  // 이전 실행의 줄은 이번 실행의 증거가 아니다.
  assert.match(
    String(
      validateAiSettingsAuditTrail(
        [line({ at: new Date(now - 600_000).toISOString() })],
        { since: now },
      ).error,
    ),
    /no local verify entry from this run/,
  );

  assert.match(
    String(
      validateAiSettingsAuditTrail([line({ host: "example.com" })], {
        since: now,
        expectedHost: "localhost:11434",
      }).error,
    ),
    /recorded host example\.com/,
  );

  assert.match(
    String(
      validateAiSettingsAuditTrail([line({ outcome: "error", httpStatus: null })], {
        since: now,
        expectedHost: "localhost:11434",
      }).error,
    ),
    /recorded outcome error/,
  );

  // 명명 벤더의 확인 줄은 로컬 갈래의 증거가 아니다.
  assert.match(
    String(
      validateAiSettingsAuditTrail([line({ provider: "anthropic" })], {
        since: now,
      }).error,
    ),
    /no local verify entry from this run/,
  );
});

test("AI settings base URL guard rejects values that would break the injected literal", () => {
  assert.equal(isSafeAiSettingsBaseUrl("http://localhost:11434"), true);
  assert.equal(isSafeAiSettingsBaseUrl("https://runner.internal:8080/v1"), true);
  for (const unsafe of [
    "",
    "localhost:11434",
    'http://localhost:11434"',
    "http://localhost:11434 && rm -rf /",
    "http://local\\host",
    "javascript:alert(1)",
  ]) {
    assert.equal(isSafeAiSettingsBaseUrl(unsafe), false, unsafe);
  }
});

test("AI settings flag carries the typed base URL into the WebView env patch", () => {
  const parsed = parseVerifyAppLaunchArgs(
    ["--verify-ai-settings", "--ai-settings-base-url=http://127.0.0.1:1234"],
    { defaultAppPath: "/tmp/Ontology Atlas.app" },
  );
  assert.equal(parsed.verifyAiSettings, true);
  assert.equal(parsed.aiSettingsBaseUrl, "http://127.0.0.1:1234");

  assert.deepEqual(
    webviewVerifyEnvPatch({
      verifyAiSettings: true,
      aiSettingsBaseUrl: "http://127.0.0.1:1234",
    }),
    {
      ONTOLOGY_ATLAS_VERIFY_WEBVIEW: "1",
      ONTOLOGY_ATLAS_VERIFY_AI_SETTINGS: "1",
      ONTOLOGY_ATLAS_VERIFY_AI_BASE_URL: "http://127.0.0.1:1234",
    },
  );

  // 플래그가 없으면 주소도 안 실린다 — 켜지 않은 검증기가 env 를 남기지 않는다.
  assert.deepEqual(webviewVerifyEnvPatch({ aiSettingsBaseUrl: "http://127.0.0.1:1234" }), {
    ONTOLOGY_ATLAS_VERIFY_WEBVIEW: "1",
  });
});

test("authorityOfBaseUrl matches the Rust host_of split", () => {
  assert.equal(authorityOfBaseUrl("http://localhost:11434"), "localhost:11434");
  assert.equal(authorityOfBaseUrl("http://localhost:11434/v1/models?x=1"), "localhost:11434");
  assert.equal(authorityOfBaseUrl("https://runner.internal/v1"), "runner.internal");
});

test("installed-app AI settings driver walks the real settings testids", () => {
  const tauriLib = fs.readFileSync("src-tauri/src/lib.rs", "utf8");

  for (const testId of [
    "app-settings-trigger",
    "app-settings-popover",
    "app-settings-nav-ai",
    "app-settings-pane-ai",
    "ai-provider-local",
    "ai-register-local",
    "ai-local-url",
    "ai-verify-local",
    "ai-local-verified",
    "ai-local-failure",
    "ai-local-model",
    "ai-local-model-listbox",
    "ai-local-connected",
  ]) {
    assert.equal(
      tauriLib.includes(testId),
      true,
      `AI settings verifier should drive the shipped ${testId} control`,
    );
  }

  // 토글 컨트롤을 폴링마다 다시 누르면 열고 닫기를 반복한다.
  assert.equal(tauriLib.includes("CLICK_COOLDOWN"), true);
  // 목록을 **재는** 코드가 실제로 실려 있다 — 계약만 있고 마커를 만드는 쪽이
  // 없으면 판정은 영원히 `undefined` 위에서 돈다.
  for (const marker of [
    "modelListVisibleHeight",
    "modelListOverflowing",
    "modelOptionsInView",
    "modelOptionsHittable",
    "elementFromPoint",
  ]) {
    assert.equal(tauriLib.includes(marker), true, `verifier should measure ${marker}`);
  }
  // 주소가 없으면 조용히 건너뛰지 않고 마커로 실패를 남긴다.
  assert.equal(
    tauriLib.includes("ONTOLOGY_ATLAS_VERIFY_AI_BASE_URL was missing or unsafe"),
    true,
  );
});

/**
 * 행 상한은 두 곳에 적혀 있다 — 앱(`select-growth.ts`)과 이 검증기. 이
 * 스크립트는 앱 번들을 import 하지 않으므로 복제가 불가피하고, 그러면 드리프트는
 * 시간 문제다. 값이 갈리는 순간 게이트가 **틀린 기준으로 초록**이 된다.
 */
test("model list row cap matches the shipped rule", () => {
  const source = fs.readFileSync("src/shared/ui/select-growth.ts", "utf8");
  const match = source.match(/export const LISTBOX_MAX_ROWS = (\d+)/);
  assert.ok(match, "select-growth.ts should export LISTBOX_MAX_ROWS");
  assert.equal(
    Number(match[1]),
    AI_SETTINGS_LISTBOX_MAX_ROWS,
    "verifier row cap drifted from the shipped rule — the gate would judge by a number the app does not use",
  );
});

test("AI settings web surface testids still exist in the shipped panel", () => {
  const panel = fs.readFileSync(
    "src/widgets/app-settings-menu/ui/AiConnectionPanel.tsx",
    "utf8",
  );
  for (const testId of [
    "ai-provider-local",
    "ai-register-local",
    "ai-local-url",
    "ai-verify-local",
    "ai-local-verified",
    "ai-local-failure",
    "ai-local-model",
    "ai-local-connected",
  ]) {
    assert.equal(panel.includes(testId), true, `panel should keep ${testId}`);
  }
});
