import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  slugToPath as mcpSlugToPath,
  loadVaultDocs,
  pathToSlug,
  walkMd as mcpWalkMd,
  writeFileAtomically as mcpWriteFileAtomically,
} from "../../mcp/src/vault.mjs";
import { compileOntology } from "../../mcp/src/ontology-compiler.mjs";
import { writeFileAtomically as cliWriteFileAtomically } from "../../cli/src/lib/atomic-write.mjs";
import { slugToPath as cliSlugToPath, writeFrontmatterKey } from "../../cli/src/lib/write-vault.mjs";
import { walkMd as cliWalkMd } from "../../cli/src/lib/walk-vault.mjs";

/**
 * **볼트 무결성 — 전부 "한 파일만 보면 정상" 이라 파일 단위 검사가 못 잡는다.**
 *
 * 2026-07-29 전면 탐색이 재현한 것들이고, 모두 사용자 데이터에 직접 닿는다.
 *
 * ## 왜 CLI 를 실행하지 않고 함수를 직접 부르나
 *
 * 첫 판은 `execFileSync` 로 실제 CLI 를 돌렸다. 로컬에선 통과했는데 CI 에서
 * 여섯 개가 `mcp exited code 1 while calling query_ontology` 로 죽었다 —
 * `compile`·`overview`·`relate` 는 MCP 서버를 **하위 프로세스로 띄우고**, 그
 * 런타임은 계약 잡에 보장돼 있지 않다.
 *
 * 계약 테스트가 프로세스 두 겹과 그 환경 변수에 의존하면, 잡는 것은 결함이
 * 아니라 **CI 환경**이다. 여기서 지키려는 계약은 전부 순수 함수 층에 있으므로
 * (경로 해석 · slug 정규화 · 노드 선별) 그 층을 직접 부른다. 실제 CLI 왕복은
 * 이 파일의 일이 아니다.
 */

const made: string[] = [];

function vault(): string {
  const dir = mkdtempSync(join(tmpdir(), "atlas-integrity-"));
  made.push(dir);
  return dir;
}

/** 프로덕션과 같은 경로로 볼트를 읽어 컴파일한다 — 테스트가 미리 거르지 않는다. */
function compileVault(root: string) {
  return compileOntology(loadVaultDocs(root), { summary: true });
}

afterEach(() => {
  for (const dir of made.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
});

/**
 * **심볼릭 링크로 볼트 밖에 쓰지 않는다.**
 *
 * `slugToPath` 는 slug 를 `resolve()` 한 **경로 문자열**이 root 안인지만 봤다.
 * 볼트 안 `escape.md` 가 밖을 가리키는 링크면 문자열은 완벽히 root 안이고
 * `writeFileSync` 는 링크를 따라 밖에 쓴다. 실측: 볼트 밖 파일이 고쳐졌는데
 * 성공 줄은 볼트 안 경로를 보고했다 — 사용자는 자기 편집을 그 경로에서
 * 찾을 수 없다.
 *
 * 그 함수의 주석이 스스로 *"prompt injection 으로 … vault root 바깥의 파일을
 * 가리키지 못하도록"* 이라고 적어 둔 위협이, slug 가 아니라 **파일시스템
 * 쪽에서** 열려 있었다. MCP·CLI 두 사본이 같은 계약을 진다.
 */
describe("볼트 밖 쓰기 — 심볼릭 링크", () => {
  /** 볼트 root 안에 root 밖 파일을 가리키는 링크를 하나 둔다. */
  function vaultWithEscapeLink(): { root: string; outside: string } {
    const base = vault();
    const root = join(base, "root");
    const outside = join(base, "outside.md");
    mkdirSync(root, { recursive: true });
    writeFileSync(outside, "---\nkind: domain\ntitle: Outside\n---\nx\n");
    symlinkSync(outside, join(root, "escape.md"));
    return { root, outside };
  }

  it.each([
    ["mcp", mcpSlugToPath],
    ["cli", cliSlugToPath],
  ])("%s: 링크된 slug 를 거절한다", (_name, resolve) => {
    const { root } = vaultWithEscapeLink();
    expect(() => resolve(root, "escape")).toThrow(/symlink/);
  });

  it.each([
    ["mcp", mcpSlugToPath],
    ["cli", cliSlugToPath],
  ])("%s: 정상 slug 는 그대로 해석한다 — 가드가 기능을 죽이지 않았다", (_name, resolve) => {
    const root = vault();
    writeFileSync(join(root, "a.md"), "---\nkind: domain\ntitle: A\n---\nx\n");
    expect(resolve(root, "a")).toBe(join(root, "a.md"));
    // 아직 없는 파일(새로 만들 자리)도 정상이다.
    expect(resolve(root, "nested/new")).toBe(join(root, "nested/new.md"));
  });

  it("쓰기가 실제로 링크 대상을 건드리지 않는다", () => {
    const { root, outside } = vaultWithEscapeLink();
    expect(() => writeFrontmatterKey(root, "escape", "relates", ["a"])).toThrow(/symlink/);
    expect(readFileSync(outside, "utf8")).not.toContain("relates");
  });
});

/**
 * **볼트 안의 링크가 볼트 밖 문서를 읽게 하지 않는다.**
 *
 * 단일 slug 쓰기는 위 가드를 탔지만 전체 목록은 별도 walker를 썼다. Dirent의
 * 심볼릭 링크는 directory가 아니므로 이름만 `.md`면 일반 파일처럼 수집됐고,
 * MCP/CLI가 링크 대상을 따라 읽었다. 선택한 vault가 읽기 경계라는 약속은 전체
 * 순회에서도 같아야 한다.
 */
describe("볼트 밖 읽기 — 심볼릭 링크", () => {
  const walkers = [
    ["mcp", mcpWalkMd],
    ["cli", cliWalkMd],
  ] as const;

  function vaultWithReadableEscape(): { root: string; safe: string } {
    const base = vault();
    const root = join(base, "root");
    const outside = join(base, "outside.md");
    const safe = join(root, "safe.md");
    mkdirSync(root, { recursive: true });
    writeFileSync(outside, "---\nkind: domain\ntitle: Outside secret\n---\nOUTSIDE_SECRET\n");
    writeFileSync(safe, "---\nkind: domain\ntitle: Safe\n---\nsafe-body\n");
    symlinkSync(outside, join(root, "escape.md"));
    return { root, safe };
  }

  it("probe: MCP와 CLI 두 walker를 모두 검사한다", () => {
    expect(walkers).toHaveLength(2);
  });

  it.each(walkers)("%s: 실제 파일만 걷고 .md 링크는 제외한다", (_name, walk) => {
    const { root, safe } = vaultWithReadableEscape();
    expect(walk(root)).toEqual([safe]);
  });

  it("MCP loader 응답에 링크 대상의 제목이나 본문이 들어오지 않는다", () => {
    const { root } = vaultWithReadableEscape();
    const docs = loadVaultDocs(root);
    expect(docs.map((doc) => doc.slug)).toEqual(["safe"]);
    expect(JSON.stringify(docs)).not.toContain("OUTSIDE_SECRET");
    expect(JSON.stringify(docs)).not.toContain("Outside secret");
  });
});

/** 원자적 교체가 private 문서를 기본 0644 임시파일 권한으로 완화하지 않는다. */
describe("볼트 파일 권한 — 원자적 갱신", () => {
  const writers = [
    ["mcp", mcpWriteFileAtomically],
    ["cli", cliWriteFileAtomically],
  ] as const;

  it("probe: MCP와 CLI 두 writer를 모두 검사한다", () => {
    expect(writers).toHaveLength(2);
  });

  it.each(writers)("%s: 0600 문서를 갱신해도 0600을 보존한다", (_name, write) => {
    const root = vault();
    const target = join(root, "private.md");
    writeFileSync(target, "before\n");
    chmodSync(target, 0o600);

    write(target, "after\n");

    expect(readFileSync(target, "utf8")).toBe("after\n");
    expect(statSync(target).mode & 0o777).toBe(0o600);
  });
});

/** 객체 메타키로 상속된 kind를 만들더라도 그래프 노드가 되지 않는다. */
describe("frontmatter 객체 메타키 — 그래프 경계", () => {
  it("probe: 정상 노드와 공격 문서를 함께 컴파일한다", () => {
    const root = vault();
    writeFileSync(
      join(root, "safe.md"),
      "---\nuid: 51890f3e-7b5d-4c0a-8f14-123456789abc\nkind: domain\ntitle: Safe\n---\n",
    );
    writeFileSync(
      join(root, "forged.md"),
      "---\n__proto__:\n  uid: 61890f3e-7b5d-4c0a-8f14-123456789abc\n  kind: domain\n  title: Forged\nsafe: value\n---\n",
    );

    const docs = loadVaultDocs(root);
    const forged = docs.find((doc) => doc.slug === "forged");
    const forgedFrontmatter = (forged?.frontmatter ?? {}) as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(forgedFrontmatter, "kind")).toBe(false);
    expect(forgedFrontmatter.kind).toBeUndefined();

    const summary = compileOntology(docs, { summary: true }) as { nodeCount: number };
    expect(summary.nodeCount).toBe(1);
  });
});

/**
 * **글자가 같으면 같은 노드다 — NFC/NFD.**
 *
 * macOS 는 파일 이름의 한글을 NFD(자모 분해)로 넘겨주는 경로가 흔하고, 사용자가
 * 프론트매터에 타이핑하는 값은 NFC 다. 두 문자열은 **글자가 완전히 같은데
 * 바이트가 다르다.** 종전엔 `validate` 가 "「한글」이 resolve 되지 않습니다"
 * 라고 경고하면서 `list` 는 바로 다음 줄에 그 노드를 보여줬고, 컴파일러도
 * 그 엣지를 `resolved: false` 로 떨어뜨렸다 — **한글 이름 노드가 관계를
 * 잃는다**, 이 제품의 주 플랫폼에서. 눈으로 구별할 수 없으니 고칠 수도 없다.
 */
describe("유니코드 정규화 — NFD 파일명", () => {
  const NFD = "한글".normalize("NFD");
  const NFC = "한글".normalize("NFC");

  it("probe: 두 형태가 실제로 바이트가 다르다", () => {
    expect(NFD).not.toBe(NFC);
    expect(NFD.normalize("NFC")).toBe(NFC);
  });

  it("NFD 파일명에서 만든 slug 는 NFC 다", () => {
    const root = vault();
    const file = join(root, `${NFD}.md`);
    expect(pathToSlug(root, file)).toBe(NFC);
  });

  it("컴파일러가 NFC 참조를 NFD 파일에 연결한다 — 경고만 지우는 것으로는 부족하다", () => {
    const root = vault();
    writeFileSync(
      join(root, `${NFD}.md`),
      "---\nuid: 01890f3e-7b5d-4c0a-8f14-123456789abc\nkind: domain\ntitle: NFD\n---\nx\n",
    );
    writeFileSync(
      join(root, "ref.md"),
      `---\nuid: 11890f3e-7b5d-4c0a-8f14-123456789abc\nkind: capability\ntitle: Ref\ndomain: ${NFC}\n---\nx\n`,
    );
    const compiled = compileOntology(loadVaultDocs(root), {}) as {
      edges?: { resolved?: boolean }[];
    };
    expect(compiled.edges?.length ?? 0).toBeGreaterThan(0);
    expect(compiled.edges?.every((edge) => edge.resolved !== false)).toBe(true);
  });
});

/**
 * **노드 수는 어느 층에서 물어도 같다.**
 *
 * `AGENTS.md` 의 계약: *"each `.md` with a frontmatter `kind:` is an ontology
 * node"*. `list`·`validate`·웹 런타임(`deriveDocNode` 는 kind 가 비면 `null`)
 * 은 그 계약을 지켰는데 **컴파일러만 모든 `.md` 를 노드로 받았다.** 볼트에
 * 평범한 메모 한 장만 있어도 `list 97 · compile 98` 이 됐고, 한 산출물 안에서
 * `nodeCount 4` 인데 `byKind` 합이 1 인 모순이 나왔다. 게다가 kind 없는 노드가
 * `overview`/`hubs` 의 결과 계약에 걸려 그 명령들이 통째로 exit 2 로 죽었다 —
 * 방금 `validate` 가 통과시킨 볼트에서.
 *
 * 기존 `graph-truth-parity` 계약이 이걸 못 잡은 이유는 그 테스트의 로더가
 * **미리 걸러서** 먹였기 때문이다(`if (!frontmatter?.kind) continue;`).
 * 프로덕션 로더는 안 거른다. 그래서 여기서는 `loadVaultDocs` 를 그대로 쓴다.
 */
describe("노드 수 일치 — kind 없는 .md", () => {
  function mixedVault(): string {
    const root = vault();
    writeFileSync(
      join(root, "real.md"),
      "---\nuid: 21890f3e-7b5d-4c0a-8f14-123456789abc\nkind: domain\ntitle: Real\n---\nx\n",
    );
    writeFileSync(join(root, "note.md"), "# 그냥 메모\n");
    writeFileSync(join(root, "readme-ish.md"), "설명만 있는 파일\n");
    return root;
  }

  it("kind 있는 문서만 노드가 된다", () => {
    const summary = compileVault(mixedVault()) as {
      nodeCount: number;
      byKind?: Record<string, number>;
    };
    expect(summary.nodeCount).toBe(1);
    const byKindTotal = Object.values(summary.byKind ?? {}).reduce((a, b) => a + b, 0);
    // 한 산출물 안에서도 모순이 없어야 한다.
    expect(byKindTotal).toBe(summary.nodeCount);
  });

  it("지나친 파일 수를 조용히 삼키지 않는다", () => {
    const summary = compileVault(mixedVault()) as { skippedNonNodeCount?: number };
    expect(summary.skippedNonNodeCount).toBe(2);
  });

  it("정상 볼트에서는 아무것도 지나치지 않는다 — 새 필터가 오탐하지 않는다", () => {
    const root = vault();
    writeFileSync(
      join(root, "a.md"),
      "---\nuid: 31890f3e-7b5d-4c0a-8f14-123456789abc\nkind: domain\ntitle: A\n---\nx\n",
    );
    writeFileSync(
      join(root, "b.md"),
      "---\nuid: 41890f3e-7b5d-4c0a-8f14-123456789abc\nkind: capability\ntitle: B\n---\nx\n",
    );
    const summary = compileVault(root) as { nodeCount: number; skippedNonNodeCount?: number };
    expect(summary.nodeCount).toBe(2);
    expect(summary.skippedNonNodeCount).toBe(0);
  });
});

/**
 * **읽지 못한 파일을 "깨끗하다" 고 보증하지 않는다.**
 *
 * 종전엔 읽기 실패를 조용히 건너뛰면서 `scanned` 에는 계속 포함시켰다. 권한
 * 없는 `.md` 하나가 있으면 `6 파일 스캔 — issue 0. vault clean ✓` 라고 답하고,
 * 같은 볼트에서 `compile` 은 EACCES 로 exit 2 했다.
 *
 * root 로 도는 CI 에서는 `chmod 000` 이 읽기를 막지 못하므로, 막지 못했으면
 * 이 검사는 스스로 건너뛴다 — 잡을 수 없는 환경에서 거짓 초록을 내지 않기 위해
 * **막혔는지 먼저 확인**한다.
 */
describe("읽지 못한 파일", () => {
  it("검사 범위 밖 파일을 삼키지 않는다", () => {
    const root = vault();
    writeFileSync(join(root, "ok.md"), "---\nkind: domain\ntitle: OK\n---\nx\n");
    const secret = join(root, "secret.md");
    writeFileSync(secret, "---\nkind: domain\ntitle: S\n---\nx\n");
    chmodSync(secret, 0o000);
    try {
      let blocked = true;
      try {
        readFileSync(secret, "utf8");
        blocked = false;
      } catch {
        blocked = true;
      }
      // root 로 도는 환경에서는 `chmod 000` 이 읽기를 막지 못한다. 잴 수 없는
      // 계약에 대해 거짓 초록을 내지 않으려면 **막혔는지 먼저 확인**해야 한다.
      if (!blocked) return;
      expect(() => loadVaultDocs(root)).toThrow();
    } finally {
      chmodSync(secret, 0o644);
    }
  });
});
