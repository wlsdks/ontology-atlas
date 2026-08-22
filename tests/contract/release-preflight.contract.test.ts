import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  admissionCheckCommands,
  currentHeadSha,
  REHEARSAL_SKIPS,
  REHEARSAL_SUBSTITUTES,
  ephemeralUpdaterKey,
  localCommandFor,
  parseAdmitReleaseSteps,
  parseBuildMacosSteps,
  PROBE_TIMEOUT_MS,
  probeTool,
} from "../../scripts/release-rehearsal.mjs";
import { RELEASE_ARTIFACT_STEPS } from "../../scripts/build-macos-release-artifact.mjs";

/**
 * `v1.0.0-rc.2` was tagged four times and stopped **at the very next step** all
 * four times. They have one thing in common: these steps are wired nowhere outside
 * the release workflow, so **they are first exercised only by tagging.** Locally
 * they all pass, because a person's machine already has everything.
 *
 * Where the sibling file `release-sidecar-order.contract.test.ts` locks the
 * sidecar's **order**, this file locks the stretch after it — dependency
 * reproducibility, the updater archive's signing state, and whether the rehearsal
 * covers the workflow without gaps.
 */

const root = process.cwd();
const WORKFLOW_PATH = join(root, ".github/workflows/release-macos.yml");
const workflow = readFileSync(WORKFLOW_PATH, "utf8");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};

describe("번들 MCP 의존은 재현 가능해야 한다", () => {
  /**
   * `mcp/`'s `package-lock.json` is **npm's** and pnpm does not read it. Without a
   * lockfile, `pnpm --dir mcp install` makes the runner resolve fresh from the
   * registry on every release — the sidecar's dependency tree changes with no commit,
   * and that binary ships in the app.
   */
  it("워크플로가 mcp 의존을 얼려서 깐다", () => {
    expect(workflow).toContain("pnpm --dir mcp install --frozen-lockfile");
  });

  it("얼릴 대상인 pnpm 락파일이 저장소에 있다", () => {
    const lockfile = readFileSync(join(root, "mcp/pnpm-lock.yaml"), "utf8");
    expect(lockfile).toContain("lockfileVersion");
    // 2026-07-29: migrated from the v1 single package to the v2 split packages. This
    // is the name the app sidecar actually compiles in, so this checks the lockfile
    // freezes it.
    expect(lockfile).toContain("@modelcontextprotocol/server");
  });

  /**
   * npm reads the top-level `overrides`, pnpm reads `pnpm.overrides`. Writing only
   * one makes npm consumers and the release runner receive **different trees** —
   * measured 2026-07-28: while only `overrides` existed, npm installed
   * `@hono/node-server@2.0.11` (the value #543 pinned to harden the trust boundary)
   * while `pnpm --dir mcp install` installed `1.19.17`. The sidecar that ships in the
   * app is compiled with the latter.
   *
   * ⚠️ **As of 2026-07-29 there are 0 overrides** — moving to the v2 SDK removed
   * `@hono/node-server`, the pin's target, from the dependency tree (v2 depends only
   * on `core`, `server`, and `zod`). A pin nobody uses is misinformation rather than a
   * spec, so it was deleted.
   *
   * The two tests below therefore **compare two empty sets** today. That looks
   * pointless but stays — the moment an override reappears they arm themselves.
   * Deleted, nobody would be watching then.
   */
  it("npm 과 pnpm 이 같은 override 를 본다", () => {
    const mcpPkg = JSON.parse(readFileSync(join(root, "mcp/package.json"), "utf8")) as {
      overrides?: Record<string, string>;
      pnpm?: { overrides?: Record<string, string> };
    };
    expect(mcpPkg.pnpm?.overrides ?? {}).toEqual(mcpPkg.overrides ?? {});
  });

  it("얼린 락파일이 그 override 를 실제로 반영한다", () => {
    const mcpPkg = JSON.parse(readFileSync(join(root, "mcp/package.json"), "utf8")) as {
      overrides?: Record<string, string>;
    };
    const lockfile = readFileSync(join(root, "mcp/pnpm-lock.yaml"), "utf8");
    for (const [name, version] of Object.entries(mcpPkg.overrides ?? {})) {
      expect(lockfile, `${name} override 가 락파일에 반영되지 않았다`).toContain(
        `${name}@${version}`,
      );
    }
  });
});

describe("업데이터 아카이브는 서명된 앱을 담아야 한다", () => {
  /**
   * `tauri build` emits `.app.tar.gz` **together with** the `.app`, but this
   * repository code-signs separately afterwards. So the archive contains the unsigned
   * app, and only users who receive the update meet "is damaged" — users who
   * downloaded the DMG are fine, so no check catches it.
   *
   * Measured 2026-07-28 on a clean checkout:
   *   before repacking  code has no resources but signature indicates they must be present
   *   after repacking   valid on disk
   *
   * So there is exactly one correct slot — **immediately after app signing, before DMG
   * packaging.**
   */
  const pipelines = [
    [
      "desktop:release-artifact",
      RELEASE_ARTIFACT_STEPS.map((step) => [step.command, ...step.args].join(" ")),
      "pnpm desktop:sign",
    ],
    [
      "desktop:release-artifact:unsigned",
      pkg.scripts["desktop:release-artifact:unsigned"].split(" && "),
      "pnpm desktop:sign:adhoc",
    ],
  ] as const;

  for (const [scriptName, commands, signStep] of pipelines) {
    it(`${scriptName} 이 앱 서명 뒤·DMG 패키징 앞에서 아카이브를 다시 만든다`, () => {
      const signAt = commands.findIndex((command) => command === signStep);
      const repackAt = commands.findIndex((command) => command === "pnpm desktop:repack-updater");
      const dmgAt = commands.findIndex((command) => command.endsWith("scripts/package-macos-dmg.mjs"));

      expect(repackAt, `${scriptName} 에 desktop:repack-updater 가 없다`).toBeGreaterThan(-1);
      expect(
        repackAt,
        "서명보다 먼저 다시 담으면 서명 전 앱을 그대로 포장한다 — 아무것도 고치지 않고 초록만 준다",
      ).toBeGreaterThan(signAt);
      expect(
        repackAt,
        "DMG 패키징보다 뒤면 DMG 와 아카이브가 서로 다른 앱을 담는다",
      ).toBeLessThan(dmgAt);
    });
  }

  it("재포장 스크립트가 등록돼 있다", () => {
    expect(pkg.scripts["desktop:repack-updater"]).toBe(
      "node scripts/repack-macos-updater-archive.mjs",
    );
  });

  it("credentialed release command는 비밀 격리 오케스트레이터 하나만 실행한다", () => {
    expect(pkg.scripts["desktop:release-artifact"]).toBe(
      "node scripts/build-macos-release-artifact.mjs",
    );
    expect(RELEASE_ARTIFACT_STEPS.length).toBe(11);
  });
});

describe("리허설이 릴리스 잡을 빠짐없이 덮는다", () => {
  const admissionSteps = parseAdmitReleaseSteps(workflow);
  const steps = parseBuildMacosSteps(workflow);

  it("admit-release 잡의 태그 검증과 source admission 단계를 실제로 읽어 온다", () => {
    expect(admissionSteps.map((step) => step.name)).toContain("Verify requested release version");
    expect(admissionSteps.map((step) => step.name)).toContain("Admit tag at current main SHA");
  });

  it("기존 태그가 주어지면 현재 HEAD의 전체 SHA로 admission 명령을 만든다", () => {
    const sha = currentHeadSha(root);
    expect(sha).toMatch(/^[0-9a-f]{40}$/i);
    expect(admissionCheckCommands("v1.2.3", sha)).toEqual([
      {
        name: "Verify requested release version",
        argv: ["pnpm", "desktop:release-tag", "--", "--tag=v1.2.3"],
      },
      {
        name: "Admit tag at current main SHA",
        argv: [
          "pnpm",
          "desktop:release-source",
          "--",
          "--mode=admit",
          "--tag=v1.2.3",
          `--sha=${sha}`,
        ],
      },
    ]);
  });

  /*
   * ⚠️ **This test used to go red at random** (observed 2026-08-21 in `#1178`).
   *
   * `--list` really invokes all four tools, since that is the answer to "what does not
   * work on this machine". With no timeout, a slow first call to `cargo`/`rustc`
   * through the rustup shim on a runner took **9.75 seconds**, exceeding vitest's
   * default 5-second limit and breaking the contract (0.18s on this machine, so it is
   * never visible locally).
   *
   * Two fixes: the script now applies a per-tool timeout (`PROBE_TIMEOUT_MS`), and
   * here it is **made explicit that what is measured is what it prints, not how
   * fast**. Relying on the default limit makes this contract a gate tied to machine
   * speed again.
   */
  it("태그 없이 목록을 보면 admission이 검증됐다고 가장하지 않고 명시적으로 SKIP 한다", { timeout: 60_000 }, () => {
    const rehearsal = spawnSync(process.execPath, ["scripts/release-rehearsal.mjs", "--list"], {
      cwd: root,
      encoding: "utf8",
    });

    expect(rehearsal.status, rehearsal.stderr).toBe(0);
    expect(rehearsal.stdout).toContain("SKIP [admit-release] Verify requested release version");
    expect(rehearsal.stdout).toContain("SKIP [admit-release] Admit tag at current main SHA");
    expect(rehearsal.stdout).toContain("ADMISSION SKIP");
  });

  it("태그 목록은 현재 HEAD SHA로 workflow의 admission 두 검사를 나란히 보인다", { timeout: 60_000 }, () => {
    const sha = currentHeadSha(root);
    const rehearsal = spawnSync(
      process.execPath,
      ["scripts/release-rehearsal.mjs", "--list", "--tag=v1.2.3"],
      { cwd: root, encoding: "utf8" },
    );

    expect(rehearsal.status, rehearsal.stderr).toBe(0);
    expect(rehearsal.stdout).toContain(
      "RUN [admit-release] Verify requested release version — pnpm desktop:release-tag -- --tag=v1.2.3",
    );
    expect(rehearsal.stdout).toContain(
      `RUN [admit-release] Admit tag at current main SHA — pnpm desktop:release-source -- --mode=admit --tag=v1.2.3 --sha=${sha}`,
    );
  });

  it("build-macos 잡의 단계를 실제로 읽어 온다", () => {
    // If the parser silently returns 0 steps, the rehearsal does nothing and goes green.
    expect(steps.length).toBeGreaterThan(10);
    expect(steps.map((step) => step.name)).toContain("Build bundled MCP sidecar");
    expect(steps.map((step) => step.name)).toContain("Stage release assets");
  });

  /**
   * This is the file's central contract. When a new step enters the workflow, the
   * rehearsal must **run it, offer a substitute, or record why it cannot run**.
   * Without one of the three, that step becomes another "square first stepped on by
   * tagging" and we start a fifth round trip.
   */
  it("모든 단계가 실행·대체·명시적 생략 중 하나로 분류된다", () => {
    const skips = REHEARSAL_SKIPS as Record<string, string | undefined>;
    const substitutes = REHEARSAL_SUBSTITUTES as Record<string, unknown>;
    const unclassified = [...admissionSteps, ...steps].filter((step: { name: string; uses: string | null }) => {
      if (step.uses) return false; // GitHub Action — runner-only
      if (skips[step.name] || substitutes[step.name]) return false;
      return localCommandFor(step) === null;
    });

    expect(
      unclassified.map((step) => step.name),
      "리허설이 이 단계를 어떻게 다룰지 말하지 않는다 — REHEARSAL_SKIPS 에 이유를 " +
        "적거나 REHEARSAL_SUBSTITUTES 에 대신 돌 것을 넣어라",
    ).toEqual([]);
  });

  it("생략 사유는 비어 있지 않다", () => {
    for (const [name, reason] of Object.entries(REHEARSAL_SKIPS)) {
      expect(reason.length, `${name} 의 생략 사유가 비어 있다`).toBeGreaterThan(20);
    }
  });

  it("리허설이 사이드카를 첫 cargo 호출보다 먼저 굽는다", () => {
    // Checks the workflow's order contract (the sibling file) carried over to the rehearsal intact.
    const names = steps.map((step) => step.name);
    expect(names.indexOf("Build bundled MCP sidecar")).toBeLessThan(
      names.indexOf("Native vault bridge tests"),
    );
  });

  it("desktop:release-rehearsal 이 등록돼 있다", () => {
    expect(pkg.scripts["desktop:release-rehearsal"]).toBe("node scripts/release-rehearsal.mjs");
  });

  it("버리는 업데이터 개인키를 저장소 밖에서 만들고 읽은 즉시 지운다", () => {
    const sandbox = mkdtempSync(join(tmpdir(), "ontology-atlas-rehearsal-key-"));
    const repoRoot = join(sandbox, "repo");
    const tempRoot = join(sandbox, "system-temp");
    mkdirSync(repoRoot);
    mkdirSync(tempRoot);

    try {
      const env = ephemeralUpdaterKey(repoRoot, {
        existingKey: "",
        tempRoot,
        generate(keyPath: string) {
          expect(keyPath.startsWith(`${tempRoot}/`)).toBe(true);
          writeFileSync(keyPath, "throwaway-private-key", { mode: 0o600 });
          return { status: 0 };
        },
      });

      expect(env).toEqual({
        TAURI_SIGNING_PRIVATE_KEY: "throwaway-private-key",
        TAURI_SIGNING_PRIVATE_KEY_PASSWORD: "",
      });
      expect(readdirSync(tempRoot)).toEqual([]);
      expect(existsSync(join(repoRoot, ".tmp", "rehearsal-updater.key"))).toBe(false);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it("버리는 업데이터 키 생성이 실패해도 임시 디렉터리를 남기지 않는다", () => {
    const sandbox = mkdtempSync(join(tmpdir(), "ontology-atlas-rehearsal-key-fail-"));
    const tempRoot = join(sandbox, "system-temp");
    mkdirSync(tempRoot);

    try {
      expect(
        ephemeralUpdaterKey(sandbox, {
          existingKey: "",
          tempRoot,
          generate: () => ({ status: 1 }),
        }),
      ).toBeNull();
      expect(readdirSync(tempRoot)).toEqual([]);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });
});

describe("다운로드 스모크 문구는 살아 있는 카탈로그에서 온다", () => {
  /**
   * #730 rebuilt the download screen and removed a sentence, but `desktop:smoke` was
   * left demanding **yesterday's sentence**, and its unit test only checked that the
   * constant equalled its own literal. With 249 tests green, the defect surfaced only
   * in the release build after tagging (the second step of
   * `desktop:release-artifact`).
   */
  it("스모크 계약에 하드코딩된 다운로드 문장이 없다", () => {
    const smoke = readFileSync(join(root, "scripts/desktop-smoke.mjs"), "utf8");
    expect(smoke).toContain("DESKTOP_SMOKE_ROUTE_TEXT_KEYS");
    for (const retired of [
      "Install once. Work from your local vault.",
      "한 번 설치하고, 내 로컬 vault 에서 작업하세요.",
      "download-fact-strip",
    ]) {
      expect(smoke, `${retired} — 어제의 문구/마커가 아직 게이트에 남아 있다`).not.toContain(
        retired,
      );
    }
  });
});

/**
 * **A tool check says one of three things — `ok`, missing, or "could not check".**
 *
 * Folding "unknown" into "missing" sends the next person off to install a tool that
 * is already fine. And without a timeout this check ties the whole test to machine
 * speed (the incident described above).
 */
describe("릴리스 리허설의 도구 확인", () => {
  it("답한 도구는 버전을 그대로 돌려준다", () => {
    const result = probeTool("x", ["--version"], {
      spawn: () => ({ status: 0, stdout: "1.2.3\n다음 줄" }),
    });
    expect(result).toEqual({ state: "ok", version: "1.2.3" });
  });

  it("실행 파일이 없으면 `missing` 이다", () => {
    const result = probeTool("x", ["--version"], {
      spawn: () => ({ status: null, error: { code: "ENOENT" } }),
    });
    expect(result.state).toBe("missing");
  });

  it("상한에 걸리면 `unknown` 이다 — 없다고 말하지 않는다", () => {
    // Node kills a timed-out child with a signal. Folding that into "missing" is the
    // "pretending to know what you do not" that this repository forbids across all
    // loading and progress surfaces.
    expect(probeTool("x", [], { spawn: () => ({ status: null, signal: "SIGTERM" }) }).state).toBe(
      "unknown",
    );
    expect(
      probeTool("x", [], { spawn: () => ({ status: null, error: { code: "ETIMEDOUT" } }) }).state,
    ).toBe("unknown");
  });

  it("상한을 실제로 넘겨 준다 — 안 넘기면 스크립트가 영영 기다릴 수 있다", () => {
    let seen: Record<string, unknown> | undefined;
    probeTool("x", [], {
      timeout: 1234,
      spawn: (_tool: string, _args: string[], options: Record<string, unknown>) => {
        seen = options;
        return { status: 0, stdout: "" };
      },
    });
    expect(seen?.timeout).toBe(1234);
  });

  it("기본 상한이 유한하고 0 이 아니다 — 그래야 상한이 상한이다", () => {
    expect(PROBE_TIMEOUT_MS).toBeGreaterThan(0);
    expect(Number.isFinite(PROBE_TIMEOUT_MS)).toBe(true);
  });
});
