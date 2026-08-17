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
} from "../../scripts/release-rehearsal.mjs";
import { RELEASE_ARTIFACT_STEPS } from "../../scripts/build-macos-release-artifact.mjs";

/**
 * `v1.0.0-rc.2` 는 네 번 찍혔고 네 번 다 **바로 다음 칸**에서 멈췄다. 공통점은
 * 하나다: 이 단계들은 릴리스 워크플로 밖 어디에도 걸려 있지 않아서, **태그를
 * 찍어야만 처음 밟힌다.** 로컬에서는 전부 통과한다 — 사람 머신에는 이미 다
 * 있기 때문이다.
 *
 * 형제 파일 `release-sidecar-order.contract.test.ts` 가 사이드카의 **순서**를
 * 잠갔다면, 이 파일은 그 뒤 구간 — 의존 재현성, 업데이터 아카이브의 서명
 * 상태, 그리고 "리허설이 워크플로를 빠짐없이 덮는가" — 를 잠근다.
 */

const root = process.cwd();
const WORKFLOW_PATH = join(root, ".github/workflows/release-macos.yml");
const workflow = readFileSync(WORKFLOW_PATH, "utf8");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};

describe("번들 MCP 의존은 재현 가능해야 한다", () => {
  /**
   * `mcp/` 의 `package-lock.json` 은 **npm 것**이고 pnpm 은 읽지 않는다.
   * 락파일 없이 `pnpm --dir mcp install` 을 돌리면 러너가 매 릴리스마다
   * 레지스트리에서 새로 푼다 — 커밋 하나 없이 사이드카의 의존 트리가 바뀌고,
   * 그 바이너리가 그대로 앱에 실린다.
   */
  it("워크플로가 mcp 의존을 얼려서 깐다", () => {
    expect(workflow).toContain("pnpm --dir mcp install --frozen-lockfile");
  });

  it("얼릴 대상인 pnpm 락파일이 저장소에 있다", () => {
    const lockfile = readFileSync(join(root, "mcp/pnpm-lock.yaml"), "utf8");
    expect(lockfile).toContain("lockfileVersion");
    // 2026-07-29: v1 단일 패키지 → v2 분할 패키지로 이관. 앱 사이드카가 실제로
    // 컴파일해 넣는 것이 이 이름이므로, 락파일이 그것을 얼리고 있는지 본다.
    expect(lockfile).toContain("@modelcontextprotocol/server");
  });

  /**
   * npm 은 최상위 `overrides` 를, pnpm 은 `pnpm.overrides` 를 읽는다. 한쪽만
   * 적으면 npm 소비자와 릴리스 러너가 **다른 트리**를 받는다 — 실측
   * (2026-07-28): `overrides` 만 있던 동안 npm 은 `@hono/node-server@2.0.11`
   * (#543 이 신뢰 경계 강화로 고정한 값)을, `pnpm --dir mcp install` 은
   * `1.19.17` 을 깔았다. 앱에 실리는 사이드카는 후자로 컴파일된다.
   *
   * ⚠️ **2026-07-29 현재 override 는 0개다** — v2 SDK 로 옮기면서 그 핀이
   * 겨누던 `@hono/node-server` 가 의존 트리에서 사라졌다(v2 의 의존은
   * `core`·`server`·`zod` 셋뿐). 아무도 안 쓰는 핀은 규격이 아니라 오정보라
   * 지웠다.
   *
   * 그래서 아래 두 시험은 지금 **빈 집합끼리 비교**한다. 무의미해 보이지만
   * 그대로 둔다 — override 가 다시 생기는 순간 스스로 무장한다. 지우면 그때
   * 아무도 안 본다.
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
   * `tauri build` 는 `.app.tar.gz` 를 `.app` 과 **함께** 낸다. 그런데 이
   * 저장소는 코드서명을 그 뒤에 따로 한다. 그래서 아카이브가 담는 것은 서명
   * 전의 앱이고, 갱신받은 사용자만 "손상되었습니다" 를 만난다 — DMG 로 받은
   * 사용자는 멀쩡하므로 아무 검사에도 안 걸린다.
   *
   * 실측(2026-07-28, 깨끗한 체크아웃):
   *   재포장 전  code has no resources but signature indicates they must be present
   *   재포장 후  valid on disk
   *
   * 그래서 자리가 하나다 — **앱 서명 바로 뒤, DMG 패키징 앞.**
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

  it("태그 없이 목록을 보면 admission이 검증됐다고 가장하지 않고 명시적으로 SKIP 한다", () => {
    const rehearsal = spawnSync(process.execPath, ["scripts/release-rehearsal.mjs", "--list"], {
      cwd: root,
      encoding: "utf8",
    });

    expect(rehearsal.status, rehearsal.stderr).toBe(0);
    expect(rehearsal.stdout).toContain("SKIP [admit-release] Verify requested release version");
    expect(rehearsal.stdout).toContain("SKIP [admit-release] Admit tag at current main SHA");
    expect(rehearsal.stdout).toContain("ADMISSION SKIP");
  });

  it("태그 목록은 현재 HEAD SHA로 workflow의 admission 두 검사를 나란히 보인다", () => {
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
    // 파서가 조용히 0개를 돌려주면 리허설은 아무것도 안 하고 초록이 된다.
    expect(steps.length).toBeGreaterThan(10);
    expect(steps.map((step) => step.name)).toContain("Build bundled MCP sidecar");
    expect(steps.map((step) => step.name)).toContain("Stage release assets");
  });

  /**
   * 이것이 이 파일의 핵심 계약이다. 워크플로에 새 단계가 들어오면 리허설은
   * 그것을 **돌리거나, 대신할 것을 대거나, 왜 못 도는지 적어야** 한다. 셋 다
   * 아니면 그 단계는 다시 "태그를 찍어야만 처음 밟히는 칸" 이 되고, 우리는
   * 5차 왕복을 시작하게 된다.
   */
  it("모든 단계가 실행·대체·명시적 생략 중 하나로 분류된다", () => {
    const skips = REHEARSAL_SKIPS as Record<string, string | undefined>;
    const substitutes = REHEARSAL_SUBSTITUTES as Record<string, unknown>;
    const unclassified = [...admissionSteps, ...steps].filter((step: { name: string; uses: string | null }) => {
      if (step.uses) return false; // GitHub Action — 러너 전용
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
    // 워크플로의 순서 계약(형제 파일)이 리허설에도 그대로 옮겨졌는지 본다.
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
   * #730 이 다운로드 화면을 다시 만들면서 문장을 걷어냈는데, `desktop:smoke`
   * 는 **어제의 문장**을 요구한 채 남았고 그 단위 테스트는 상수가 자기
   * 리터럴과 같은지만 봤다. 249개 테스트가 초록인 채로, 결함은 태그를 찍은
   * 뒤의 릴리스 빌드에서만 드러났다(`desktop:release-artifact` 의 두 번째 단계).
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
