import assert from "node:assert/strict";
import test from "node:test";

import {
  parseWebviewVerifyPayload,
  validateWebviewVerifyPayload,
} from "./verify-macos-app-launch.mjs";
import {
  WEBVIEW_WORKBENCH_MARKERS,
  webviewWorkbenchMarkersForPath,
} from "./lib/verify-macos/webview-env.mjs";
import { validateTopologyMapV2CanvasEvidence } from "./lib/verify-macos/payload-contract.mjs";

/**
 * **설치 앱 WebView 페이로드 계약 — 남은 것만 잰다** (2026-08-12).
 *
 * ## 이 파일이 10,042줄에서 여기까지 줄어든 이유
 *
 * 종전 이 파일은 단언 **288개** · 마커 이름 **913종** · `sigma`/`skeleton` 언급
 * **135회**로, 사실상 **은퇴한 토폴로지 프로브의 시험 묶음**이었다. 그 프로브들은
 * #1034·#1036 에서 은퇴했다 — 없어진 Sigma 시절 DOM 을 기다렸고, 뷰포트 대신 지도를
 * 기준으로 삼는 제품과 좌표계가 달랐고, 한국어 문구를 그대로 못박고 있었다. 열한 개
 * 검증 스크립트 중 **하나도 초록이 될 수 없었다.**
 *
 * 그 요구가 사라지자 이 파일의 두 거대 시험이 「메시지를 돌려줘야 한다」고 단언한
 * 자리에서 `null` 을 받아 빨개졌다 — **시험이 제품보다 오래 살아남은 것**이다.
 *
 * 그래서 시험을 제품에 맞춘다. 여기 남는 것은 **오늘도 매 배포에서 실제로 도는 검사**
 * 다: 페이로드 모양 · 라우트 · 픽스처 볼트 · 감속 모션 · WebView 크기.
 * 그 검사들은 `pnpm desktop:deploy:app` 이 세션마다 통과시키고 있고, 은퇴한 요구가
 * 되살아나는 것은 `tests/contract/desktop-probe-markers.contract.test.ts` 가 막는다.
 *
 * ⚠️ **줄어든 것을 「검사가 약해졌다」로 읽지 말 것.** 지운 288개 단언은 **없는 DOM 을
 * 겨냥하고 있었다** — 그것들이 초록이던 이유는 제품이 옳아서가 아니라 아무도 안
 * 돌려서였다(CI 참조 0개).
 */

/**
 * 계약을 통과하는 최소 페이로드 — 여기서 한 가지씩 망가뜨려 각 검사를 확인한다.
 *
 * ⚠️ **문서함 라우트를 쓴다.** `/topology` 에는 살아 있는 요구가 더 붙는다(Relief 마커 ·
 * 한국어 크롬 라벨 · 스테이지 팬 문턱 …). 그걸 최소 페이로드에 다 채우면 이 시험이
 * **일반 계약을 재는 게 아니라 지도 요구 목록을 베끼는 일**이 된다. 지도 쪽 요구가
 * 살아 있다는 사실은 아래 마지막 시험이 따로 확인한다.
 */
function validPayload({ markers: markerOverrides, ...overrides } = {}) {
  return {
    href: "tauri://localhost/ko/docs/",
    title: "Ontology Atlas",
    bodyText: "Atlas\n지도\n문서함\n공방\n인사이트\n프로젝트\n지형도\nINDEX",
    bodyChildren: 21,
    readyState: "complete",
    bg: "rgb(8, 9, 10)",
    color: "rgb(247, 248, 248)",
    width: 1512,
    height: 917,
    // 마커는 **병합한다** — 덮어쓰면 셸 마커가 사라져 엉뚱한 검사가 먼저 걸린다
    // (이 시험을 쓰다 실제로 두 번 헛짚었다).
    markers: { ontologyNav: true, sourceVaultNav: true, ...markerOverrides },
    ...overrides,
  };
}

test("payload contract · 워크벤치 마커가 현행 한국어 셸을 받는다", () => {
  const koreanShell = "Atlas\n지도\n문서함\n공방\n인사이트\n프로젝트\n지형도\nINDEX\n내 프로젝트";
  assert.equal(
    WEBVIEW_WORKBENCH_MARKERS.every((marker) => marker.test(koreanShell)),
    true,
    "현행 셸 문구가 마커를 통과하지 못한다 — 마커가 낡았다",
  );
  // 공회전 차단: 마커가 아무거나 통과시키면 이 검사는 없는 것이다.
  assert.equal(
    WEBVIEW_WORKBENCH_MARKERS.every((marker) => marker.test("lorem ipsum")),
    false,
  );
});

test("payload contract · Agents 라우트는 지도 문구 없이 자기 본문으로 증명한다", () => {
  const markers = webviewWorkbenchMarkersForPath("/ko/agents/");
  assert.equal(
    markers.every((marker) =>
      marker.test("에이전트\n이 컴퓨터의 도구\nMCP 연결"),
    ),
    true,
  );
  assert.equal(markers.every((marker) => marker.test("Loading local app shell")), false);
});

test("payload contract · topology route accepts the current map shell", () => {
  const markers = webviewWorkbenchMarkersForPath("/en/topology/");
  const currentMapBody = "Atlas\nMap\nDocs\nWorkshop\nInsights\nProjects\nAgents\nHistory\nINDEX";
  assert.equal(markers.every((marker) => marker.test(currentMapBody)), true);
  assert.equal(markers.every((marker) => marker.test("Atlas\nDocs\nWorkshop")), false);
});

test("payload contract · 정상 페이로드는 통과한다", () => {
  assert.equal(validateWebviewVerifyPayload(validPayload()), null);
});

test("payload contract · v2 캔버스 픽셀 증거가 없으면 멈춘다", () => {
  assert.match(
    validateTopologyMapV2CanvasEvidence({ topologyMapEngine: "v2" }),
    /rendered pixels/,
  );
  assert.match(
    validateTopologyMapV2CanvasEvidence({ topologyMapEngine: "v2", topologyV2CanvasInkPixels: 0 }),
    /rendered pixels/,
  );
  assert.equal(
    validateTopologyMapV2CanvasEvidence({ topologyMapEngine: "v2", topologyV2CanvasInkPixels: 128 }),
    null,
  );
});

test("payload contract · 모양이 틀린 페이로드를 이유와 함께 막는다", () => {
  assert.match(validateWebviewVerifyPayload(null), /missing WebView verification payload/);
  assert.match(
    validateWebviewVerifyPayload(validPayload({ href: "https://example.com/" })),
    /tauri:\/\//,
  );
  assert.match(
    validateWebviewVerifyPayload(validPayload({ readyState: "loading" })),
    /readyState=loading/,
  );
  assert.match(validateWebviewVerifyPayload(validPayload({ bodyText: "   " })), /body text was empty/);
  assert.match(
    validateWebviewVerifyPayload(validPayload({ bodyText: "lorem ipsum dolor" })),
    /workbench markers/,
  );
  // 마커 자체가 없는 경우는 병합을 우회해서 직접 만든다.
  assert.match(
    validateWebviewVerifyPayload({ ...validPayload(), markers: null }),
    /structured markers/,
  );
});

test("payload contract · 라우트를 확인한다", () => {
  assert.equal(validateWebviewVerifyPayload(validPayload(), { expectedPath: "/ko/docs/" }), null);
  assert.match(
    validateWebviewVerifyPayload(validPayload(), { expectedPath: "/en/docs/" }),
    /route/i,
  );
});

test("payload contract · 픽스처 볼트가 그 볼트인지 확인한다", () => {
  const vault = "/tmp/atlas-fixture";
  // 볼트를 요구했는데 다른 볼트(또는 없음)면 막는다 — 사용자의 실제 볼트를 읽고
  // 검증했다고 말하는 것이 이 검사가 막으려는 사고다.
  assert.match(
    validateWebviewVerifyPayload(validPayload(), { expectedFixtureVault: vault }),
    /fixture vault/,
  );
  assert.match(
    validateWebviewVerifyPayload(
      validPayload({ markers: { verificationFixtureVaultError: "boom" } }),
      { expectedFixtureVault: vault },
    ),
    /fixture vault bootstrap failed/,
  );
  assert.equal(
    validateWebviewVerifyPayload(
      validPayload({ markers: { verificationFixtureVault: vault, verificationFixtureVaultError: "" } }),
      { expectedFixtureVault: vault },
    ),
    null,
  );
});

test("payload contract · WebView 크기 상·하한을 잰다", () => {
  assert.match(
    validateWebviewVerifyPayload(validPayload({ width: 900, height: 600 }), {
      minWebviewSize: { width: 1400, height: 860 },
    }),
    /viewport was 900x600, expected at least 1400x860/,
  );
  assert.equal(
    validateWebviewVerifyPayload(validPayload(), { minWebviewSize: { width: 1400, height: 860 } }),
    null,
  );
  assert.match(
    validateWebviewVerifyPayload(validPayload({ width: 2000, height: 1400 }), {
      maxWebviewSize: { width: 1100, height: 800 },
    }),
    /viewport was 2000x1400/,
  );
});

test("payload contract · 감속 모션을 요구하면 그 사실을 확인한다", () => {
  const message = validateWebviewVerifyPayload(validPayload(), {
    requireWebviewReducedMotion: true,
  });
  assert.equal(typeof message, "string", "감속 요구가 아무것도 확인하지 않는다");
  assert.match(message, /reduced/i);
});

test("payload contract · 중첩 JSON 을 그대로 되읽는다", () => {
  const payload = validPayload({ markers: { ontologyNav: true, nested: { a: [1, 2, { b: "c" }] } } });
  const stdout = `noise\n[ontology-atlas-webview-verify] ${JSON.stringify(JSON.stringify(payload))}\nmore noise\n`;
  assert.deepEqual(parseWebviewVerifyPayload(stdout), payload);
});

test("payload contract · 지도 라우트의 요구는 여전히 살아 있다", () => {
  /*
   * 은퇴시킨 것은 **카드 시절 프로브**이고, 지도 페이로드의 기본 요구는 그대로다.
   * 이 시험이 없으면 「일반 계약만 재는 파일」이 되어, 지도 쪽이 조용히 무력해져도
   * 아무도 모른다.
   */
  const message = validateWebviewVerifyPayload(
    validPayload({ href: "tauri://localhost/ko/topology/" }),
  );
  assert.equal(typeof message, "string", "지도 라우트인데 아무것도 요구하지 않는다");
  assert.match(message, /topology|Relief/i);
});
