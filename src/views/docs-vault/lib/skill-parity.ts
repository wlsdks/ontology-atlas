import type { AgentFilesAnalysis } from './agent-files';

/**
 * 「내 스킬 사본이 서로 일치하는가」 — 스킬 하나당 한 줄.
 *
 * ## 왜 이 화면이 존재하는가 (PO 카운슬 2026-07-29)
 *
 * `agent-setup` 은 스킬을 **두 벌**로 깐다: `.claude/skills/` 는 Claude Code
 * 가, `.agents/skills/` 는 Codex 가 읽는다. 한쪽만 고치면 **같은 스킬이 도구에
 * 따라 다르게 판정한다.** 실측 사례: `motion-verify` 의 `?guides=off` 규율이
 * `.claude` 사본에만 있어서, 오늘 Codex 로 그 스킬을 돌리면 첫 방문 안내가 켜진
 * 화면을 재고 틀린 판정을 낸다. 사람이 눈치챌 단서는 화면 어디에도 없다.
 *
 * CLI `agent-files` 는 이 사실을 이미 낸다. 화면이 못 내던 이유는 manifest
 * walker 두 곳이 `if (name.startsWith('.')) continue;` 로 dot 디렉터리를 걸러
 * `.claude/skills` 가 **manifest 에 절대 안 들어오기** 때문이다. 그래서 기존
 * `skillCopy` 검사는 코드는 있으나 발화할 수 없는 죽은 코드였다. 이 슬라이스는
 * walker 를 바꾸지 않고 **데스크톱 브리지(절대 경로)** 로 따로 읽는다.
 *
 * ## 이 모듈이 하지 않는 것
 *
 * 판정만 한다. 고치지 않고, 병합하지 않고, 어느 쪽이 옳은지도 말하지 않는다 —
 * **어느 사본이 최신인지는 파일이 모르고 사람이 안다.** 고치는 일은 화면 밖
 * 핸드오프(에이전트 한 줄)로 넘어간다. 사람은 판정하고 에이전트가 고친다.
 */

/** 스킬 한 개의 판정. 세 값뿐이다 — 늘리면 읽는 사람이 표를 외워야 한다. */
export type SkillParityVerdict =
  /** 두 사본이 파일 단위로 전부 같다. */
  | 'agreed'
  /** 두 사본이 다 있는데 내용이 갈렸다. */
  | 'diverged'
  /** 한쪽 트리에만 있다(전체가 없거나, 안의 파일 일부가 없거나). */
  | 'one-sided';

export interface SkillParityRow {
  /** 스킬 폴더 이름 — `.claude/skills/<name>/…` 의 `<name>`. */
  name: string;
  verdict: SkillParityVerdict;
  /** 이 스킬이 실제로 존재하는 트리. `one-sided` 를 사람 말로 옮길 때 쓴다. */
  presentIn: Array<'.claude/skills' | '.agents/skills'>;
  /**
   * 갈라진(또는 한쪽에만 있는) 파일의 스킬 내부 상대 경로. 본문 diff 는 이
   * 화면의 일이 아니지만(카운슬 OUT), **어느 파일인지**는 말해야 넘겨받는
   * 에이전트가 열 자리를 안다.
   */
  files: string[];
}

export interface SkillParityModel {
  rows: SkillParityRow[];
  /** 판정이 `agreed` 가 아닌 줄 수. */
  disagreeing: number;
}

const CLAUDE = '.claude/skills/';
const AGENTS = '.agents/skills/';

function skillOf(path: string): string | null {
  const rest = path.startsWith(CLAUDE)
    ? path.slice(CLAUDE.length)
    : path.startsWith(AGENTS)
      ? path.slice(AGENTS.length)
      : null;
  if (rest === null) return null;
  const name = rest.split('/')[0];
  return name === '' ? null : name;
}

/**
 * 이미 계산된 분석에서 **스킬 단위**로 접는다.
 *
 * 새 비교 로직을 짓지 않는 것이 요점이다 — 파일 단위 판정은 `analyzeAgentFiles`
 * 가 CLI 와 같은 계약으로 이미 내고 있고, 두 번째 구현을 만들면 그 둘이 갈리는
 * 날 아무도 모른다. 여기서는 **접기만** 한다.
 */
export function buildSkillParityModel(analysis: AgentFilesAnalysis): SkillParityModel {
  const present = new Map<string, Set<'.claude/skills' | '.agents/skills'>>();
  for (const record of analysis.records) {
    const name = skillOf(record.path);
    if (!name) continue;
    const tree = record.path.startsWith(CLAUDE) ? '.claude/skills' : '.agents/skills';
    const set = present.get(name) ?? new Set();
    set.add(tree);
    present.set(name, set);
  }

  const diverged = new Map<string, Set<string>>();
  const oneSided = new Map<string, Set<string>>();
  for (const finding of analysis.drift) {
    if (finding.check !== 'skill-copy') continue;
    // skill-copy 의 `path` 는 **스킬 트리 기준 상대 경로**(`<skill>/SKILL.md`)다.
    const name = finding.path.split('/')[0];
    if (!name) continue;
    const bucket = finding.code === 'skill-copy-diverged' ? diverged : oneSided;
    const set = bucket.get(name) ?? new Set();
    set.add(finding.path.slice(name.length + 1) || finding.path);
    bucket.set(name, set);
  }

  // **한쪽 트리만 존재하면 일치 질문 자체가 성립하지 않는다.** `.agents/skills`
  // 가 아예 없다는 것은 "Codex 를 설정하지 않았다" 는 뜻이지 사본이 갈렸다는
  // 뜻이 아니다. 그런데 스킬마다 한 줄씩 「한쪽에만」 을 그리면 **사실 하나가
  // 열한 줄이 되고**, 화면은 아무 일도 없는 볼트를 문제투성이로 보이게 한다.
  // CLI 도 이 경우를 `not-applicable` 로 답한다 — 계약 테스트가 그 어긋남을
  // 잡아 이 줄이 생겼다(2026-07-29).
  const treesInPlay = new Set<string>();
  for (const set of present.values()) for (const tree of set) treesInPlay.add(tree);
  if (treesInPlay.size < 2) return { rows: [], disagreeing: 0 };

  const rows: SkillParityRow[] = [...present.keys()].sort().map((name) => {
    const trees = [...(present.get(name) ?? [])].sort();
    // 한쪽 트리에만 스킬 폴더가 통째로 없는 경우도 one-sided 다. 이건 파일
    // 단위 finding 이 나오지 않으므로(비교할 짝이 아예 없다) 여기서 정한다.
    const wholeTreeMissing = trees.length < 2;
    const divergedFiles = [...(diverged.get(name) ?? [])].sort();
    const oneSidedFiles = [...(oneSided.get(name) ?? [])].sort();
    const verdict: SkillParityVerdict =
      wholeTreeMissing || oneSidedFiles.length > 0
        ? 'one-sided'
        : divergedFiles.length > 0
          ? 'diverged'
          : 'agreed';
    return {
      name,
      verdict,
      presentIn: trees as SkillParityRow['presentIn'],
      files: verdict === 'diverged' ? divergedFiles : oneSidedFiles,
    };
  });

  return { rows, disagreeing: rows.filter((row) => row.verdict !== 'agreed').length };
}
