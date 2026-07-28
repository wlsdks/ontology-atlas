import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 사이드카는 **첫 cargo 호출보다 먼저** 만들어져야 한다.
 *
 * `src-tauri/tauri.conf.json` 이 `externalBin` 으로 MCP 바이너리를 선언한
 * 뒤로는, 번들 단계뿐 아니라 **모든 cargo 호출**이 그 파일을 요구한다 —
 * Tauri 빌드 스크립트가 resource path 존재를 확인하고, 없으면
 * `resource path ... doesn't exist` 로 죽는다.
 *
 * 2026-07-28 `v1.0.0-rc.2` 가 정확히 여기서 멈췄다. 사이드카를
 * `desktop:build:app` 안에서만 만들고 있었는데, 워크플로는 그 전에
 * `cargo test`(= `test:desktop:bridge`)를 돌린다. 두 아키텍처 모두 실패했고
 * 스테이징·발행은 건너뛰어졌다.
 *
 * 로컬에서는 안 드러난다 — 사람이 한 번 빌드해 두면 파일이 남아 있어서
 * 그 뒤 모든 cargo 호출이 통과한다. **깨끗한 체크아웃에서만 보이는 결함**이라
 * 워크플로 순서를 계약으로 고정한다.
 */

const WORKFLOW_PATH = join(process.cwd(), ".github/workflows/release-macos.yml");
const TAURI_CONF_PATH = join(process.cwd(), "src-tauri/tauri.conf.json");

/**
 * cargo 를 (직접이든 pnpm 스크립트를 거쳐서든) 돌리는 **실행 줄**.
 *
 * 주석이 아니라 `run:` 이 실제로 실행하는 것만 본다 — 처음엔 `"cargo "` 를
 * 통째로 찾게 썼다가, 바로 위 단계에 내가 적은 **설명 주석**이 걸려서 계약이
 * 스스로 빨개졌다. 문자열을 찾는 게이트는 자기 문서까지 읽는다.
 */
const CARGO_RUN_LINES = [/^\s*run:\s*pnpm test:desktop:bridge\b/m, /^\s*run:.*\bcargo\s/m] as const;

const SIDECAR_STEP = "pnpm mcp:build-binary";

describe("release workflow — 사이드카 순서 (v1.0.0-rc.2 회귀)", () => {
  const workflow = readFileSync(WORKFLOW_PATH, "utf8");

  it("tauri.conf.json 이 여전히 externalBin 으로 사이드카를 선언한다", () => {
    const conf = JSON.parse(readFileSync(TAURI_CONF_PATH, "utf8")) as {
      bundle?: { externalBin?: string[] };
    };
    // 이 선언이 사라지면 아래 순서 계약의 전제 자체가 없어진다 — 그때는
    // 이 파일을 지우는 것이 맞고, 이 단언이 그 사실을 먼저 알려 준다.
    expect(conf.bundle?.externalBin ?? []).toContain("binaries/ontology-atlas-mcp");
  });

  it("사이드카 빌드 단계가 존재한다", () => {
    expect(workflow).toContain(SIDECAR_STEP);
  });

  it("사이드카 빌드가 cargo 를 돌리는 모든 단계보다 앞선다", () => {
    const sidecarAt = workflow.indexOf(SIDECAR_STEP);
    expect(sidecarAt).toBeGreaterThan(-1);

    for (const pattern of CARGO_RUN_LINES) {
      const global = new RegExp(pattern.source, "gm");
      for (const match of workflow.matchAll(global)) {
        expect(
          match.index,
          `"${match[0].trim()}" 가 사이드카 빌드보다 먼저 나온다 — 깨끗한 ` +
            `체크아웃에서 resource path 가 없어 cargo 가 죽는다`,
        ).toBeGreaterThan(sidecarAt);
      }
    }
  });
});
