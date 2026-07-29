import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

/**
 * **볼트 무결성 3종 — 전부 "한 파일만 보면 정상" 이라 파일 단위 검사가 못 잡는다.**
 *
 * 2026-07-29 전면 탐색이 재현한 것들이고, 셋 다 사용자 데이터에 직접 닿는다.
 * 단위 테스트가 아니라 **실제 CLI 를 실행**해서 잰다 — 세 결함 모두 순수 함수가
 * 아니라 파일시스템·프로세스 경계에서 났기 때문이다.
 */

const CLI = join(process.cwd(), "cli/src/index.mjs");
const made: string[] = [];

function vault(): string {
  const dir = mkdtempSync(join(tmpdir(), "atlas-integrity-"));
  made.push(dir);
  return dir;
}

function run(args: string[]): { out: string; code: number } {
  try {
    const out = execFileSync("node", [CLI, ...args], { encoding: "utf8", stdio: "pipe" });
    return { out, code: 0 };
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string; status?: number };
    return { out: `${e.stdout ?? ""}${e.stderr ?? ""}`, code: e.status ?? 1 };
  }
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
 * `writeFileSync` 는 링크를 따라 밖에 쓴다. 실측: `/tmp/sym/outside.md` 가
 * 고쳐졌는데 성공 줄은 `wrote …/vault/escape.md` 라고 보고했다 — 사용자는
 * 자기 편집을 그 경로에서 찾을 수 없다.
 *
 * 그 함수의 주석이 스스로 *"prompt injection 으로 … vault root 바깥의 파일을
 * 가리키지 못하도록"* 이라고 적어 둔 위협이, slug 가 아니라 **파일시스템
 * 쪽에서** 열려 있었다.
 */
describe("볼트 밖 쓰기 — 심볼릭 링크", () => {
  it("링크된 slug 로의 쓰기를 거절하고, 링크 대상은 그대로다", () => {
    const root = vault();
    const outside = join(root, "outside.md");
    const inner = join(root, "vault");
    execFileSync("mkdir", ["-p", inner]);
    writeFileSync(outside, "---\nkind: domain\ntitle: Outside\n---\nx\n");
    writeFileSync(join(inner, "real.md"), "---\nkind: domain\ntitle: Real\n---\nx\n");
    symlinkSync(outside, join(inner, "escape.md"));

    const { out, code } = run(["relate", "escape", "real", "relates", "--vault", inner]);

    expect(code, `기대: 거절. 실제 출력:\n${out}`).not.toBe(0);
    expect(out).toContain("symlink");
    // 링크 대상이 안 바뀌었는가 — 이게 진짜 계약이다.
    const after = execFileSync("cat", [outside], { encoding: "utf8" });
    expect(after).not.toContain("relates");
  });

  it("정상 경로 쓰기는 그대로 된다 — 가드가 기능을 죽이지 않았다", () => {
    const root = vault();
    writeFileSync(join(root, "a.md"), "---\nkind: domain\ntitle: A\n---\nx\n");
    writeFileSync(join(root, "b.md"), "---\nkind: domain\ntitle: B\n---\nx\n");
    const { code, out } = run(["relate", "a", "b", "relates", "--vault", root]);
    expect(code, out).toBe(0);
  });
});

/**
 * **두 문서가 같은 slug 를 주장하면 error 다.**
 *
 * `patch_concept` 이 `frontmatter.slug` 를 다른 노드가 이미 쓰는 값으로
 * 덮어써도 막지 않았고(`add_concept` 은 막고 `rename_concept` 은 `overwrite`
 * 를 요구하는데 이 경로만 열려 있었다), `validate` 는 `vault clean ✓` 라고
 * 답했다 — 같은 볼트에서 컴파일러는 `ambiguous-alias` 를 내면서.
 */
describe("중복 slug", () => {
  it("두 문서가 같은 slug 를 주장하면 error 로 잡는다", () => {
    const root = vault();
    writeFileSync(join(root, "a.md"), "---\nslug: dup\nkind: domain\ntitle: A\n---\nx\n");
    writeFileSync(join(root, "b.md"), "---\nslug: dup\nkind: domain\ntitle: B\n---\nx\n");
    const { out, code } = run(["validate", root]);
    expect(out).toContain("duplicate-slug");
    expect(code, "중복 slug 는 그래프가 성립하지 않는 상태라 error 다").not.toBe(0);
  });

  it("정상 볼트는 여전히 clean — 새 코드가 오탐하지 않는다", () => {
    const root = vault();
    writeFileSync(join(root, "a.md"), "---\nkind: domain\ntitle: A\n---\nx\n");
    writeFileSync(join(root, "b.md"), "---\nkind: domain\ntitle: B\n---\nx\n");
    const { out, code } = run(["validate", root]);
    expect(out).not.toContain("duplicate-slug");
    expect(code, out).toBe(0);
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

  it("NFD 파일명을 NFC 참조가 가리켜도 dangling 이 아니다", () => {
    const root = vault();
    writeFileSync(join(root, `${NFD}.md`), "---\nkind: domain\ntitle: NFD\n---\nx\n");
    writeFileSync(
      join(root, "ref.md"),
      `---\nkind: capability\ntitle: Ref\ndomain: ${NFC}\n---\nx\n`,
    );
    const { out, code } = run(["validate", root]);
    expect(out).not.toContain("dangling-graph-reference");
    expect(code, out).toBe(0);
  });

  it("컴파일러도 그 엣지를 연결한다 — 경고만 지우는 것으로는 부족하다", () => {
    const root = vault();
    writeFileSync(join(root, `${NFD}.md`), "---\nkind: domain\ntitle: NFD\n---\nx\n");
    writeFileSync(
      join(root, "ref.md"),
      `---\nkind: capability\ntitle: Ref\ndomain: ${NFC}\n---\nx\n`,
    );
    const { out } = run(["compile", root, "--json"]);
    const graph = JSON.parse(out) as { edges?: { resolved?: boolean }[] };
    expect(graph.edges?.length ?? 0).toBeGreaterThan(0);
    expect(graph.edges?.every((e) => e.resolved !== false)).toBe(true);
  });
});

/**
 * **열어 보지 못한 파일을 "깨끗하다" 고 보증하지 않는다.**
 *
 * 종전엔 읽기 실패를 조용히 건너뛰면서 `scanned` 에는 계속 포함시켰다. 권한
 * 없는 `.md` 하나가 있으면 `6 파일 스캔 — issue 0. vault clean ✓` 라고 답하고,
 * 같은 볼트에서 `compile` 은 EACCES 로 exit 2 했다.
 */
describe("읽지 못한 파일", () => {
  it("clean 을 선언하지 않고, 못 읽은 파일을 이름으로 말한다", () => {
    const root = vault();
    writeFileSync(join(root, "ok.md"), "---\nkind: domain\ntitle: OK\n---\nx\n");
    const secret = join(root, "secret.md");
    writeFileSync(secret, "---\nkind: domain\ntitle: S\n---\nx\n");
    chmodSync(secret, 0o000);
    try {
      const { out, code } = run(["validate", root]);
      expect(out).toContain("secret.md");
      expect(code, "보증할 수 없는 파일이 있으면 0 이 아니다").not.toBe(0);
      // "2 파일 스캔" 이라고 말하면 안 된다 — 하나는 열어 보지도 못했다.
      expect(out).not.toMatch(/2 파일 스캔[^]*clean/);
    } finally {
      chmodSync(secret, 0o644);
    }
  });
});

/**
 * **노드 수는 어느 명령에서 물어도 같다.**
 *
 * `AGENTS.md` 의 계약: *"each `.md` with a frontmatter `kind:` is an ontology
 * node"*. `list`·`validate`·웹 런타임(`deriveDocNode` 는 kind 가 비면 `null`)
 * 은 그 계약을 지켰는데 **컴파일러만 모든 `.md` 를 노드로 받았다.** 볼트에
 * 평범한 메모 한 장만 있어도 `list 97 · compile 98` 이 됐고, 한 산출물 안에서
 * `nodeCount 4` 인데 `byKind` 합이 1 인 모순이 나왔다.
 *
 * 더 나쁜 것: kind 없는 노드가 `overview`/`hubs` 의 결과 계약(비어 있지 않은
 * `kind` 요구)에 걸려 **명령 전체가 exit 2** 로 죽었다 — 파일 이름도 안 알려
 * 주는 내부 문자열과 함께, 방금 `validate` 가 통과시킨 볼트에서.
 *
 * 기존 `graph-truth-parity` 계약이 이걸 못 잡은 이유는 그 테스트의 로더가
 * **미리 걸러서** 먹였기 때문이다(`if (!frontmatter?.kind) continue;`).
 * 프로덕션 로더는 안 거른다. 그래서 여기서는 **거르지 않은 볼트를 CLI 에
 * 그대로** 준다.
 */
describe("노드 수 일치 — kind 없는 .md", () => {
  function mixedVault(): string {
    const root = vault();
    writeFileSync(join(root, "real.md"), "---\nkind: domain\ntitle: Real\n---\nx\n");
    writeFileSync(join(root, "note.md"), "# 그냥 메모\n");
    writeFileSync(join(root, "readme-ish.md"), "설명만 있는 파일\n");
    return root;
  }

  it("list 와 compile 이 같은 수를 센다", () => {
    const root = mixedVault();
    const list = run(["list", root, "--json"]);
    const compiled = run(["compile", root, "--summary", "--json"]);
    const listed = (JSON.parse(list.out) as { total?: number }).total;
    const summary = JSON.parse(compiled.out) as {
      nodeCount?: number;
      skippedNonNodeCount?: number;
      byKind?: Record<string, number>;
    };
    expect(summary.nodeCount, `list=${listed} compile=${summary.nodeCount}`).toBe(listed);
    // 한 산출물 안에서도 모순이 없어야 한다.
    const byKindTotal = Object.values(summary.byKind ?? {}).reduce((a, b) => a + b, 0);
    expect(byKindTotal).toBe(summary.nodeCount);
  });

  it("지나친 파일 수를 조용히 삼키지 않는다", () => {
    const root = mixedVault();
    const { out } = run(["compile", root, "--summary", "--json"]);
    expect((JSON.parse(out) as { skippedNonNodeCount?: number }).skippedNonNodeCount).toBe(2);
  });

  it("overview 가 kind 없는 파일 때문에 죽지 않는다", () => {
    const root = mixedVault();
    const { out, code } = run(["overview", root]);
    expect(code, `overview 는 평범한 메모가 섞인 볼트에서 살아야 한다:\n${out}`).toBe(0);
    expect(out).not.toContain("invalid hub shape");
  });
});
