import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MCP_TOOL_COUNT,
  RELEASE_ARCHES,
  RELEASE_MIN_MACOS,
  RELEASE_SIGNING,
  RELEASE_VERSION,
  buildDmgName,
} from "./release-facts";

function readJson(relativePath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(process.cwd(), relativePath), "utf8"));
}

describe("release-facts", () => {
  it("matches the version declared in package.json", () => {
    const pkg = readJson("package.json");
    expect(RELEASE_VERSION).toBe(pkg.version);
  });

  it("matches the version declared in src-tauri/tauri.conf.json", () => {
    const tauriConf = readJson("src-tauri/tauri.conf.json");
    expect(RELEASE_VERSION).toBe(tauriConf.version);
  });

  /**
   * **네 번째 자리** — `src-tauri/Cargo.toml` (2026-08-01 추가).
   *
   * 이 시험은 오래 셋만 봤고(`RELEASE_VERSION` · `package.json` ·
   * `tauri.conf.json`), Cargo 는 `pnpm desktop:check` 에서만 검사됐다. 그
   * 비대칭의 값은 rc.5 버전 올림에서 그대로 나왔다: 유닛 스위트 5,502건이
   * 전부 초록인 채로 릴리스 리허설이 **첫 단계에서** 멈췄다
   * (`cargo=1.0.0-rc.4`).
   *
   * 늦게 잡히는 것이 문제다 — 리허설은 앱 컴파일이 들어 있어 사람이 태그
   * 직전에 돌리는 무거운 관문이고, 거기서 처음 알게 되면 왕복이 한 번 는다.
   * 같은 사실을 0.5초에 알 수 있으면 0.5초에 안다.
   *
   * TOML 파서를 들이지 않는다 — 이 파일이 필요한 것은 최상위 `version` 한
   * 줄이고, 그걸 위해 의존성을 더하면 게이트가 자기 비용을 넘어선다.
   */
  it("matches the version declared in src-tauri/Cargo.toml", () => {
    const cargo = readFileSync(join(process.cwd(), "src-tauri/Cargo.toml"), "utf8");
    // `[package]` 절의 첫 `version = "…"` — 의존성 절의 version 과 섞이지 않게
    // 파일 앞머리에서만 찾는다.
    const packageSection = cargo.split(/^\[/m)[1] ?? cargo;
    const match = /^version\s*=\s*"([^"]+)"/m.exec(packageSection);
    expect(match?.[1], "src-tauri/Cargo.toml 의 [package] version 을 못 읽었다").toBeDefined();
    expect(RELEASE_VERSION).toBe(match?.[1]);
  });

  it("matches the minimum macOS version declared in src-tauri/tauri.conf.json", () => {
    const tauriConf = readJson("src-tauri/tauri.conf.json") as {
      bundle?: { macOS?: { minimumSystemVersion?: string } };
    };
    const minimumSystemVersion = tauriConf.bundle?.macOS?.minimumSystemVersion;
    expect(minimumSystemVersion).toBeDefined();
    expect(RELEASE_MIN_MACOS).toBe(`macOS ${minimumSystemVersion!.split(".")[0]}`);
  });

  it("builds DMG names matching the real check-macos-download-release.mjs naming convention", () => {
    expect(buildDmgName("aarch64")).toBe(`ontology-atlas_${RELEASE_VERSION}_aarch64.dmg`);
    expect(buildDmgName("x64")).toBe(`ontology-atlas_${RELEASE_VERSION}_x64.dmg`);
    for (const arch of RELEASE_ARCHES) {
      expect(buildDmgName(arch)).toMatch(/^ontology-atlas_[^/]+_(aarch64|x64)\.dmg$/);
    }
  });

  // `/download` 는 "이 앱은 Apple 서명·공증을 받는다" 를 사실로 내건다. 그
  // 주장을 지탱하는 것은 문구가 아니라 릴리스 자산을 만드는 명령 체인이다 —
  // 체인에서 서명이나 공증 검증이 빠지면 문구가 조용히 거짓이 되므로, 여기서
  // 막는다. (2026-07-27 이전에는 그 반대 방향으로 거짓이었다: 서명 경로가
  // 살아났는데 페이지가 "아직 서명되지 않음" 을 계속 말하고 있었다.)
  it("only claims signing and notarization while the release chain actually enforces them", () => {
    const pkg = readJson("package.json") as { scripts?: Record<string, string> };
    const chain = pkg.scripts?.["desktop:release-artifact"] ?? "";

    expect(RELEASE_SIGNING.developerId).toBe(chain.includes("desktop:sign"));
    expect(RELEASE_SIGNING.notarized).toBe(chain.includes("desktop:notarize"));
    // 검증 없는 서명은 주장이지 증거가 아니다.
    expect(chain).toContain("desktop:verify-release-dmg");
    expect(pkg.scripts?.["desktop:verify-release-dmg"]).toContain("--require-signed");
    expect(pkg.scripts?.["desktop:verify-release-dmg"]).toContain("--require-notarized");
  });

  it("matches the MCP tool count declared in mcp/src/index.js", () => {
    const source = readFileSync(join(process.cwd(), "mcp/src/index.js"), "utf8");
    const start = source.indexOf("const TOOLS = [");
    expect(start).toBeGreaterThan(-1);
    const block = source.slice(start, source.indexOf("\n];", start));
    expect(block.match(/^\s+name: '/gm)?.length ?? 0).toBe(MCP_TOOL_COUNT);
  });
});
