import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ATLAS_CHECKOUT_PLACEHOLDER } from "@/shared/config/cli-invocation";

/**
 * **자리 표시를 보여 주는 화면은 채우는 법도 보여 준다.**
 *
 * ## 왜 이 게이트가 생겼나 (2026-07-29 도그푸딩)
 *
 * `/git` 의 웹 강등 카드가 `node $ATLAS/cli/src/index.mjs snapshot` 을 복사
 * 버튼과 함께 내놓는데, `$ATLAS` 가 무엇인지는 어디에도 없었다. 복사해서
 * 붙여넣으면 셸이 빈 변수로 풀어 `node /cli/src/index.mjs` 를 실행한다 —
 * **살아 있는 채널을 안내하면서 죽은 명령을 준 것이다.**
 *
 * 안내 문장은 이미 `cli-invocation.ts` 에 있었고, 그 파일 주석이 스스로
 * *"명령을 내보내는 표면은 이걸 함께 실어야 한다"* 라고 적어 두었다. 규격이
 * 문서에만 있으면 지켜지지 않는다는 이 저장소의 반복 교훈이 그대로 재현됐다.
 *
 * ## 무엇을 재나
 *
 * 자리 표시를 **사람에게 보여 주는** 파일이 같은 파일에서 안내 메시지 키를
 * 함께 쓰는지. 에이전트에게 건네는 텍스트(`ATLAS_CLI_HINT_EN` 을 이미 싣는
 * 레시피)와 자리 표시를 정의하는 파일 자신은 제외한다.
 *
 * 툴팁은 안내로 치지 않는다 — 터치에서 도달할 수 없다. 그래서 검사는 보이는
 * 문구가 오는 곳(i18n 키)을 찾는다.
 */

const HINT_KEY = "cliPlaceholderHint";
const AGENT_HINT = "ATLAS_CLI_HINT_EN";

/** 자리 표시를 정의·조립하는 파일 자신 — 여기엔 안내가 없는 게 맞다. */
const DEFINITION_FILES = ["src/shared/config/cli-invocation.ts"];

/**
 * **아직 안 고친 자리 — 래칫.**
 *
 * 이 목록은 **줄어들기만 한다.** 여기 있는 파일들은 에이전트에게 건네는
 * 핸드오프 blob 안에서 `$ATLAS` 명령을 조립하는데, 아직 안내 줄을 안 싣는다.
 * 에이전트도 그 명령을 그대로는 못 돌리므로 언젠가 전부 고쳐야 한다 —
 * 다만 파일마다 blob 구조가 달라(문자열 배열 · 프롬프트 문장 · 레시피) 한
 * 번에 손대면 복사 텍스트 계약 테스트를 함께 흔든다.
 *
 * **침묵하는 예외를 만들지 않으려고 목록으로 적는다.** 게이트가 이 파일들을
 * 조용히 건너뛰면 다음 감사자는 "전부 덮였다"고 읽는다. 목록에 이름이 있으면
 * 덜 덮였다는 사실이 매번 보인다. 새 파일을 여기 **추가하는 것은 금지** —
 * 아래 `probe` 가 목록이 자라는 것을 막는다.
 */
const HANDOFF_BLOBS_PENDING = [
  "src/features/docs-vault-local/model/agent-activity-status.ts",
  "src/features/docs-vault-local/ui/OntologyStarterCta.tsx",
  "src/features/vault-ontology/ui/LiveActivityIndicator.tsx",
  "src/shared/lib/ontology-tree/agent-readiness.ts",
  "src/views/home/lib/footprint-trail.ts",
  "src/views/home/lib/topology-analysis.ts",
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(full) && !/\.test\.tsx?$/.test(full) ? [full] : [];
  });
}

/**
 * **주석은 세지 않는다.** 첫 판은 파일 텍스트를 그대로 훑어서 11건을 잡았는데
 * 전부 *"CLI 로는 `node $ATLAS/… health` 다"* 같은 **설명 주석**이었다 —
 * 사람에게 그려지는 명령이 아니라 개발자에게 대응 관계를 알려 주는 산문이고,
 * 거기에 안내 문구를 요구하는 건 뜻이 없다. 잡아야 할 것은 **출력으로 나가는
 * 문자열**이다.
 *
 * 문자열 리터럴 안의 `//` 를 주석으로 오인하지 않도록 따옴표 상태를 함께
 * 따라간다 — URL(`https://…`)이 흔해서 이 구분이 실제로 필요하다.
 */
function stripComments(src: string): string {
  let out = "";
  let i = 0;
  let quote: string | null = null;
  while (i < src.length) {
    const c = src[i]!;
    const next = src[i + 1];
    if (quote) {
      if (c === "\\") {
        out += c + (next ?? "");
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      out += c;
      i += 1;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      out += c;
      i += 1;
      continue;
    }
    if (c === "/" && next === "/") {
      while (i < src.length && src[i] !== "\n") i += 1;
      continue;
    }
    if (c === "/" && next === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

describe("CLI 자리 표시 — 보여 주는 화면은 채우는 법도 보여 준다", () => {
  const files = walk("src").filter((f) => !DEFINITION_FILES.includes(f));
  const sources = new Map(files.map((f) => [f, stripComments(readFileSync(f, "utf8"))]));

  it("probe: 실제로 소스를 읽고 있다", () => {
    expect(files.length).toBeGreaterThan(100);
    expect(ATLAS_CHECKOUT_PLACEHOLDER).toBe("$ATLAS");
  });

  it("probe: 자리 표시를 쓰는 파일이 실제로 존재한다 — 0건이면 탐지기가 죽은 것", () => {
    const users = [...sources].filter(
      ([, s]) => s.includes(ATLAS_CHECKOUT_PLACEHOLDER) || /\b(ATLAS_CLI|atlasCli)\b/.test(s),
    );
    expect(users.length).toBeGreaterThan(0);
  });

  /**
   * **래칫은 줄어들기만 한다.** 목록이 커질 수 있으면 그건 예외가 아니라
   * 새 규칙이 되고, 게이트는 통과 도장이 된다.
   */
  it("래칫: 미처리 목록이 자라지 않는다", () => {
    expect(HANDOFF_BLOBS_PENDING.length).toBeLessThanOrEqual(6);
  });

  /**
   * **죽은 면제는 지운다.** 목록의 파일이 이미 고쳐졌거나 사라졌으면 여기서
   * 터진다 — 안 그러면 아무것도 안 막는 이름이 영원히 남아 다음 사람에게
   * "아직 6건 남았다" 는 거짓 재고를 준다.
   */
  it.each(HANDOFF_BLOBS_PENDING)("래칫 항목 %s 는 아직 실재하는 미처리다", (file) => {
    const src = sources.get(file);
    expect(src, `목록에 있는데 파일이 없다 — 항목을 지워라`).toBeDefined();
    expect(
      src!.includes(HINT_KEY) || src!.includes(AGENT_HINT),
      `이미 안내를 싣고 있다 — 래칫에서 지워라 (그래야 목록이 재고로 남는다)`,
    ).toBe(false);
  });

  it("사람이 읽는 자리 표시에는 안내가 붙어 있다", () => {
    const offenders = [...sources]
      // **자리 표시를 손으로 쓴 파일만 보면 구멍이 난다.** 첫 판이 그랬다:
      // 이 게이트를 만들게 한 `/git` 강등 카드는 `$ATLAS` 를 한 번도 안 쓰고
      // `ATLAS_CLI` 로 조립한다 — 그래서 후보 집합에 아예 없었고, 힌트를
      // 지우는 프로브가 통과했다. 조립 경로도 같은 문자열을 화면에 낸다.
      .filter(
        ([, s]) =>
          s.includes(ATLAS_CHECKOUT_PLACEHOLDER) ||
          /\b(ATLAS_CLI|atlasCli)\b/.test(s),
      )
      // 에이전트에게 건네는 텍스트는 영문 상수를 직접 싣는다 — 그쪽은 통과.
      .filter(([, s]) => !s.includes(AGENT_HINT))
      .filter(([, s]) => !s.includes(HINT_KEY))
      // 안내를 **문장으로 직접 쓴** 긴 문서(볼트 starter README)도 통과. 안내
      // 방식이 i18n 키 하나여야 할 이유는 없고, 요구하는 것은 "채우는 법이
      // 같은 자리에 있다" 이다. 판별은 대입문 자체로 한다 — 그게 사용자가
      // 실제로 실행할 한 줄이기 때문이다.
      .filter(([, s]) => !s.includes(`export ${ATLAS_CHECKOUT_PLACEHOLDER.slice(1)}=`))
      .map(([f]) => f)
      .filter((f) => !HANDOFF_BLOBS_PENDING.includes(f));

    expect(
      offenders,
      `이 파일들이 "${ATLAS_CHECKOUT_PLACEHOLDER}" 를 화면에 내면서 채우는 법을 말하지 않는다.\n` +
        `사람이 읽는 자리면 t("${HINT_KEY}") 를 같은 자리에 그리고,\n` +
        `에이전트에게 건네는 텍스트면 ${AGENT_HINT} 를 실어라.\n` +
        `툴팁(title)은 안내로 치지 않는다 — 터치에서 도달할 수 없다.\n` +
        `위반: ${offenders.join(", ")}`,
    ).toEqual([]);
  });
});

/**
 * i18n 쪽 반쪽 — 키가 두 로케일에 다 있어야 한다. 한쪽만 있으면 다른 언어
 * 사용자에게는 안내 자리에 **키 경로**가 그려진다.
 */
describe("CLI 자리 표시 안내 — 두 로케일에 다 있다", () => {
  const PATHS = [
    ["atlasGit", HINT_KEY],
    ["projectPages", "selector", HINT_KEY],
  ] as const;

  it.each(["ko", "en"])("%s 에 안내 문구가 있다", (locale) => {
    const messages = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8"));
    for (const path of PATHS) {
      const value = path.reduce<unknown>(
        (acc, key) => (acc as Record<string, unknown> | undefined)?.[key],
        messages,
      );
      expect(typeof value, `${locale}: ${path.join(".")}`).toBe("string");
      expect((value as string).length).toBeGreaterThan(10);
    }
  });
});
