/**
 * `SKILL.md` 파싱 — **규격의 정본은 Anthropic 공식 문서**이고 우리는 읽기만 한다.
 *
 * 이 파일의 세 함수는 `scripts/audit-claude-skills.mjs` 와 **같은 답을 내야 한다**.
 * 한쪽은 개발용 명령이고 한쪽은 화면인데, 둘이 다른 답을 내면 「명령에서는 겹친다고
 * 했는데 화면에는 없다」가 된다. 그 어긋남을 막는 것이
 * `tests/contract/agent-skill-parse.contract.test.ts` 다 — 같은 표를 양쪽에 넣는다.
 */

/** 스킬이 자기 폴더에 싣는다고 약속하는 하위 폴더 — 여기 가리킴은 실재해야 한다. */
const BUNDLED_PREFIX = /^(\.\/)?(references|scripts|assets|templates|examples)\//;

/** 실행되는 확장자 — 읽기와 실행을 가르는 선. */
const EXECUTABLE_EXT = /\.(py|sh|mjs|js|ts|rb|pl)$/;

/**
 * 설명에서 빼는 낱말. 트리거 겹침을 재려면 «어느 스킬에나 나오는 말»을 빼야 한다 —
 * 안 빼면 모든 쌍이 겹쳐 보이고 순위가 뜻을 잃는다.
 */
const STOP = new Set(
  (
    "use when this the a an and or for to of in on with that if you your is are be it its as by from at not do using used " +
    "claude user users any all only also more most other others than then there their them into over under about after before " +
    "should must can could would may might will need needs needed want wants asks ask asking request requests requested " +
    "skill skills file files folder directory create creating creates make makes making build building builds " +
    "etc via per each one two both new like such same out up down off"
  ).split(/\s+/),
);

export function distinctiveTerms(description: string): string[] {
  return [
    ...new Set(
      String(description)
        .toLowerCase()
        .replace(/[^a-z0-9가-힣\s-]/g, " ")
        .split(/\s+/)
        .filter((word) => word.length > 2 && !STOP.has(word)),
    ),
  ];
}

export interface ParsedSkill {
  readonly name: string | null;
  readonly description: string;
  readonly body: string;
}

/** frontmatter 에서 **발동을 정하는 두 값**만 뽑는다. 없으면 스킬이 아니다. */
export function parseSkill(raw: string): ParsedSkill | null {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return null;
  const frontmatter: Record<string, string> = {};
  let key: string | null = null;
  for (const line of match[1].split("\n")) {
    const kv = line.match(/^([a-zA-Z-]+):\s*(.*)$/);
    if (kv) {
      key = kv[1];
      frontmatter[key] = kv[2].trim();
    } else if (key && /^\s+\S/.test(line)) {
      // YAML 접힌 줄(`|-` 뒤 여러 줄) — 설명이 길면 흔하다.
      frontmatter[key] += ` ${line.trim()}`;
    }
  }
  return {
    name: frontmatter.name ?? null,
    description: frontmatter.description ?? "",
    body: match[2],
  };
}

export interface ClassifiedReferences {
  /** 스킬 폴더 안에 있다고 약속한 것 — 없으면 결함이다. */
  readonly bundled: string[];
  /** 「프로젝트에 있으면 읽어라」식 — 없어도 결함이 아니다. */
  readonly conditional: string[];
}

/**
 * 본문이 가리키는 파일 참조를 **자기 폴더**와 **조건부**로 가른다.
 *
 * 이 구분이 없으면 「고쳐야 할 것 700건」이라는 소음이 나온다 — 실측으로 그중
 * 666건이 조건부라 결함이 아니었다.
 */
export function classifyReferences(body: string): ClassifiedReferences {
  const bundled = new Set<string>();
  const conditional = new Set<string>();
  for (const hit of body.matchAll(
    /(?:^|[\s(`'"])([A-Za-z0-9_./-]+\.(?:md|py|js|mjs|ts|sh|json|csv|txt))/g,
  )) {
    const ref = hit[1];
    if (ref.startsWith("http") || ref.includes("://")) continue;
    (BUNDLED_PREFIX.test(ref) ? bundled : conditional).add(ref);
  }
  return { bundled: [...bundled], conditional: [...conditional] };
}

/** 읽히는 게 아니라 **돌아가는** 파일인가. */
export function isExecutableRef(ref: string): boolean {
  return EXECUTABLE_EXT.test(ref);
}
