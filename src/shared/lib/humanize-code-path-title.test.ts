import { describe, expect, it } from "vitest";
import {
  humanizeCodePathTitle,
  looksLikeCodePath,
} from "./humanize-code-path-title";

describe("looksLikeCodePath", () => {
  it("알려진 확장자를 가진 경로를 코드 경로로 판정한다", () => {
    expect(looksLikeCodePath("src/widgets/topology-map-v2/ui/topology-world.ts")).toBe(
      true,
    );
  });

  it("알려진 루트 폴더 prefix 를 가진 경로를 코드 경로로 판정한다", () => {
    expect(looksLikeCodePath("cli/src/commands/agent-brief.mjs")).toBe(true);
  });

  it("공백을 포함하면 코드 경로가 아니다", () => {
    expect(looksLikeCodePath("MCP Server")).toBe(false);
  });

  it("슬래시가 없으면 코드 경로가 아니다", () => {
    expect(looksLikeCodePath("readme.md")).toBe(false);
  });

  it("알려진 prefix/확장자가 없는 슬래시 경로는 코드 경로가 아니다", () => {
    expect(looksLikeCodePath("elements/agent-activity-hooks")).toBe(false);
  });
});

describe("humanizeCodePathTitle", () => {
  it("kebab-case 파일명을 사람이 읽는 제목으로 변환한다", () => {
    expect(
      humanizeCodePathTitle(
        "src/widgets/topology-map-v2/ui/topology-world.ts",
      ),
    ).toBe("Topology World");
  });

  it("kebab-case .mjs 파일명을 사람이 읽는 제목으로 변환한다", () => {
    expect(humanizeCodePathTitle("cli/src/commands/agent-brief.mjs")).toBe(
      "Agent Brief",
    );
  });

  it("index.ts 는 부모 세그먼트를 승격한다", () => {
    expect(humanizeCodePathTitle("src/features/user-auth/index.ts")).toBe(
      "User Auth",
    );
  });

  it("camelCase 파일명은 단어 경계에서 공백화한다", () => {
    expect(humanizeCodePathTitle("src/lib/parseFrontmatter.ts")).toBe(
      "Parse Frontmatter",
    );
  });

  it("코드 경로처럼 보이지 않으면 null 을 반환한다", () => {
    expect(humanizeCodePathTitle("MCP Server")).toBeNull();
  });

  it("prefix 목록에 없는 folder-prefixed 경로는 null 을 반환한다", () => {
    expect(humanizeCodePathTitle("elements/agent-activity-hooks")).toBeNull();
  });

  it("공백을 포함한 문자열은 null 을 반환한다", () => {
    expect(humanizeCodePathTitle("src/foo bar.ts")).toBeNull();
  });

  it("슬래시가 없는 문자열은 null 을 반환한다", () => {
    expect(humanizeCodePathTitle("topology-world.ts")).toBeNull();
  });

  it("결정론적이다 — 동일 입력에 동일 출력", () => {
    const input = "src/widgets/topology-map-v2/ui/topology-world.ts";
    expect(humanizeCodePathTitle(input)).toBe(humanizeCodePathTitle(input));
  });

  it("SKILL.md 는 확장자 제거 후 generic 흡수되어 부모 디렉토리명을 쓴다", () => {
    expect(
      humanizeCodePathTitle(".claude/skills/ontology-sync/SKILL.md"),
    ).toBe("Ontology Sync");
  });

  it("index.ts 의 부모마저 generic(lib) 이면 한 단계 더 승격한다(최대 2단계)", () => {
    expect(humanizeCodePathTitle("src/lib/index.ts")).toBe("Src");
  });

  it("3글자 이하의 짧은 잔재 세그먼트(목록 밖 단어)는 부모 세그먼트로 승격한다", () => {
    expect(
      humanizeCodePathTitle("src/widgets/topology-map-v2/db.ts"),
    ).toBe("Topology Map V2");
  });

  it("generic 목록에 새로 추가된 단어(src/lib/ui/api/util 등)도 승격 대상이다", () => {
    expect(humanizeCodePathTitle("cli/src")).toBe("Cli");
  });
});
