import type {
  AgentSkill,
  SkillInventory,
  SkillInvocation,
  SkillNameCollision,
  SkillTriggerOverlap,
} from "../model/types";
import { classifyReferences, distinctiveTerms, isExecutableRef, parseSkill } from "./parse-skill";

/** 사용자가 고른 폴더에서 읽어 온 파일 하나. */
export interface SkillSourceFile {
  /** 고른 폴더 기준 상대 경로. */
  readonly relativePath: string;
  readonly text: string;
}

export interface BuildInventoryInput {
  readonly files: readonly SkillSourceFile[];
  /**
   * 고른 폴더 안에 실재하는 **모든** 상대 경로 — 자기 폴더 참조가 깨졌는지 볼 때 쓴다.
   *
   * ⚠️ 이 집합을 안 주면 「참조가 다 깨졌다」가 아니라 **「깨진 참조 없음」**으로
   * 답한다. 확인할 수 없는 것을 결함이라고 말하지 않는 쪽이 옳다 — 반대로 하면
   * 폴더를 얕게 읽은 것만으로 멀쩡한 스킬 수십 개가 빨갛게 뜬다.
   */
  readonly existingPaths?: ReadonlySet<string>;
}

/** `a/b/SKILL.md` → `a/b`. */
function dirOf(relativePath: string): string {
  const cut = relativePath.lastIndexOf("/");
  return cut === -1 ? "" : relativePath.slice(0, cut);
}

/**
 * 사람이 읽는 출처 이름. 마켓플레이스 설치본은 경로가 길어서
 * (`plugins/cache/<플러그인>/<버전>/skills/<이름>/SKILL.md`) 통째로 보여 주면
 * 목록이 경로 문자열 벽이 된다. **플러그인 이름 한 마디**로 줄인다.
 */
export function sourceLabelOf(relativePath: string): string {
  const parts = relativePath.split("/").filter(Boolean);
  const cacheAt = parts.indexOf("cache");
  if (cacheAt !== -1 && parts[cacheAt + 1]) return parts[cacheAt + 1];
  const skillsAt = parts.indexOf("skills");
  if (skillsAt > 0) return parts[skillsAt - 1];
  if (skillsAt === 0) return "skills";
  return parts[0] ?? "";
}

/**
 * **호출하면 무슨 일이 일어나나** — 3단.
 *
 * 규격이 정한 순서 그대로다: `name`+`description` 은 항상 실리고, 본문은 발동해야
 * 실리고, 딸린 파일은 본문이 가리켜야 실린다. 「항상」 층이 중요한 이유는 그것이
 * **스킬을 한 번도 안 써도 매 세션 드는 값**이기 때문이다 — 스킬을 60개 켜 둔
 * 사람은 그 60개의 설명을 매번 낸다.
 */
export function buildInvocation(
  skillDir: string,
  description: string,
  body: string,
  bundled: readonly string[],
): SkillInvocation {
  const resolve = (ref: string) => {
    const clean = ref.replace(/^\.\//, "");
    return skillDir ? `${skillDir}/${clean}` : clean;
  };
  const executables = bundled.filter(isExecutableRef).map(resolve);
  return {
    steps: [
      {
        stage: "always",
        label: "alwaysLoaded",
        chars: description.length,
        files: [],
      },
      {
        stage: "onTrigger",
        label: "onTrigger",
        chars: body.length,
        files: [skillDir ? `${skillDir}/SKILL.md` : "SKILL.md"],
      },
      {
        stage: "onDemand",
        label: "onDemand",
        chars: 0,
        files: bundled.map(resolve),
      },
    ],
    executables,
  };
}

function buildSkill(file: SkillSourceFile, existingPaths?: ReadonlySet<string>): AgentSkill | null {
  const parsed = parseSkill(file.text);
  // 규격상 두 값이 다 있어야 스킬이다. 하나라도 없으면 런타임이 못 부르므로
  // 목록에 올리는 것이 오히려 거짓말이 된다.
  if (!parsed?.name || !parsed.description) return null;

  const dir = dirOf(file.relativePath);
  const { bundled } = classifyReferences(parsed.body);
  const invocation = buildInvocation(dir, parsed.description, parsed.body, bundled);
  const missingBundled = existingPaths
    ? invocation.steps[2].files.filter((path) => !existingPaths.has(path))
    : [];

  return {
    name: parsed.name,
    description: parsed.description,
    body: parsed.body,
    origin: {
      relativePath: file.relativePath,
      source: sourceLabelOf(file.relativePath),
      personal: !file.relativePath.startsWith('plugins/'),
    },
    terms: distinctiveTerms(parsed.description),
    invocation,
    missingBundled,
  };
}

/** 이름이 같은 것끼리 묶는다 — 사용자는 어느 쪽이 뜰지 모른다. */
function findCollisions(skills: readonly AgentSkill[]): SkillNameCollision[] {
  const byName = new Map<string, AgentSkill[]>();
  for (const skill of skills) {
    const bucket = byName.get(skill.name);
    if (bucket) bucket.push(skill);
    else byName.set(skill.name, [skill]);
  }
  return [...byName.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([name, group]) => ({
      name,
      skills: group,
      descriptionsDiffer: new Set(group.map((s) => s.description)).size > 1,
    }))
    // 설명까지 다른 쪽이 더 위험하다 — 그냥 사본이 아니라 발동 조건이 경쟁한다.
    .sort((a, b) => Number(b.descriptionsDiffer) - Number(a.descriptionsDiffer));
}

/**
 * 이름은 다른데 발동 조건이 겹치는 쌍.
 *
 * 이름이 같은 쌍은 위에서 이미 셌으므로 **여기서 또 세지 않는다** — 두 번 세면
 * 순위가 오염되고, 사용자는 같은 문제를 두 곳에서 읽는다.
 */
function findOverlaps(skills: readonly AgentSkill[], minScore: number): SkillTriggerOverlap[] {
  const out: SkillTriggerOverlap[] = [];
  for (let i = 0; i < skills.length; i += 1) {
    for (let j = i + 1; j < skills.length; j += 1) {
      const a = skills[i];
      const b = skills[j];
      if (a.name === b.name) continue;
      const bTerms = new Set(b.terms);
      const shared = a.terms.filter((term) => bTerms.has(term));
      const smaller = Math.min(a.terms.length, b.terms.length);
      if (smaller === 0) continue;
      const score = shared.length / smaller;
      if (score >= minScore && shared.length >= 2) out.push({ a, b, shared, score });
    }
  }
  return out.sort((x, y) => y.score - x.score);
}

export function buildSkillInventory({
  files,
  existingPaths,
}: BuildInventoryInput): SkillInventory {
  const skills = files
    .map((file) => buildSkill(file, existingPaths))
    .filter((skill): skill is AgentSkill => skill !== null)
    .sort((a, b) => a.name.localeCompare(b.name));

  const bundledFiles = skills.reduce((sum, s) => sum + s.invocation.steps[2].files.length, 0);
  const executables = skills.reduce((sum, s) => sum + s.invocation.executables.length, 0);
  const alwaysLoadedChars = skills.reduce((sum, s) => sum + s.invocation.steps[0].chars, 0);

  return {
    skills,
    collisions: findCollisions(skills),
    overlaps: findOverlaps(skills, 0.4),
    broken: skills.filter((s) => s.missingBundled.length > 0),
    totals: { skills: skills.length, bundledFiles, executables, alwaysLoadedChars },
  };
}
