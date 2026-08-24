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
    // The list is not clipped, every option it claims is visible is clickable, and it is
    // under the row ceiling so there is no scrolling at all.
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
  // The failure mode this repository has been burned by repeatedly: nothing was found,
  // reported as "zero violations", green.
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
    // Measured in the installed app, 2026-08-02 — **counted is not the same as visible.**
    // The 7 the runner returned all passed the role/aria/text markers while only 1 was on
    // screen (a 264px list clipped to 39px by an ancestor's overflow). The old verdict was
    // green here, so this defect was caught by no gate at all.
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
    // The ceiling rule: 7 is under the row ceiling (8), so all of them must show at once,
    // and since scrolling means "there is more", having it on here would be a lie.
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

  // A line from a previous run is not evidence about this run.
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

  // A named vendor's confirmation line is not evidence about the local branch.
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

  // Without the flag the address is not loaded either — a verifier that was not enabled
  // leaves no env behind.
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
  // The probe JavaScript moved out of `lib.rs` into `src-tauri/src/webview_verify/*.js` on
  // 2026-08-24 so a linter could finally see it. Reading only the Rust would silently stop
  // finding every marker this test exists to pin — the assertions would pass on an empty
  // haystack, which is the failure mode this file is meant to prevent.
  const tauriLib = [
    fs.readFileSync("src-tauri/src/lib.rs", "utf8"),
    ...fs
      .readdirSync("src-tauri/src/webview_verify")
      .filter((name) => name.endsWith(".js"))
      .map((name) => fs.readFileSync(`src-tauri/src/webview_verify/${name}`, "utf8")),
  ].join("\n");

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

  // Re-clicking a toggle control on every poll just opens and closes it repeatedly.
  assert.equal(tauriLib.includes("CLICK_COOLDOWN"), true);
  // The code that **measures** the list is actually loaded — with the contract present
  // but nothing producing the marker, the verdict runs forever over `undefined`.
  for (const marker of [
    "modelListVisibleHeight",
    "modelListOverflowing",
    "modelOptionsInView",
    "modelOptionsHittable",
    "elementFromPoint",
  ]) {
    assert.equal(tauriLib.includes(marker), true, `verifier should measure ${marker}`);
  }
  // A missing address is not skipped quietly; it leaves a failure marker.
  assert.equal(
    tauriLib.includes("ONTOLOGY_ATLAS_VERIFY_AI_BASE_URL was missing or unsafe"),
    true,
  );
});

/**
 * The row ceiling is written in two places — the app (`select-growth.ts`) and this
 * verifier. This script does not import the app bundle, so duplication is unavoidable
 * and drift is only a matter of time. The moment the values diverge, the gate goes
 * **green against the wrong standard.**
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
