#!/usr/bin/env node
/**
 * **설치된 Claude Agent Skills 뭉치를 훑어 무결성을 잰다** — 발견 도구다.
 *
 * ## 왜 이 저장소에 있나 (2026-08-09)
 *
 * 소유자 질문: *"스킬도 다 md 로 만드니까 스킬 그 자체를 graph 화 시킬 수는
 * 없나? 스킬도 연계하는 구조로?"* — 그 방향에 실체가 있는지 **재 보려고**
 * 만들었다. 제품 기능이 아니고, 화면도 없고, 공개 CLI 명령도 아니다
 * (그건 PO 카운슬 필수 소집 사안이다).
 *
 * ## 스킬이 어떻게 발동하나 (이 도구가 무엇을 재는지의 전제)
 *
 * 스킬은 `SKILL.md` 하나를 담은 폴더이고, 세션 시작에는 frontmatter 의
 * `name` + `description` 만 실린다(스킬당 50~100 토큰). 관련돼 보이면 본문을
 * 읽고, 본문이 다른 파일을 가리키면 그때 그것만 읽는다 — 3단 점진적 공개.
 * 그래서 **발동을 정하는 것은 `description` 한 줄**이고, 본문의 가리킴이
 * 실재하지 않으면 3단째가 조용히 비어 버린다.
 *
 * 공개 문서: platform.claude.com/docs/en/agents-and-tools/agent-skills/overview
 *
 * ## 이 도구가 재는 셋 — 그리고 왜 그 셋인가
 *
 * ① **이름 충돌** — 같은 이름이 여러 벌 설치되면 무엇이 이기는지 비결정적이다.
 *    설명까지 서로 다르면 «발동 조건이 다른 것들이 같은 이름으로 경쟁»한다.
 * ② **트리거 겹침** — 이름이 달라도 설명이 같은 낱말을 공유하면 하나가 다른
 *    하나를 가린다. 공개 처방은 「영역을 좁히고 `Do not use for X` 를 적어라」인데,
 *    그건 사람이 손으로 관리해야 한다는 뜻이다.
 * ③ **자기 폴더 참조의 무결성** — 스킬이 «내 폴더의 이 파일을 읽어라» 라고
 *    가리킨 것이 실재하는가.
 *
 * ## ⚠️ 무엇을 세는지가 이 도구의 전부다 — 두 번 틀렸다
 *
 * **첫 번째 오분류: 참조를 한 덩어리로 셌다.** 없는 파일을 가리키는 참조가
 * 700건이었는데 666건은 «프로젝트에 이런 파일이 있으면 읽어라» 식 **조건부**라
 * 결함이 아니었다. 갈라야 숫자가 행동 가능해진다.
 *
 * **두 번째 오분류(더 컸다): 로드되지 않는 파일을 셌다.** 첫 판은
 * `~/.claude/plugins` 를 통째로 훑어 **207개**를 보고했다. 그 안에는
 * ⓐ `cache/` — 버전 고정 다운로드 스냅샷(같은 플러그인의 5.1.0 **과** 6.2.0,
 * 커밋 해시별 사본) ⓑ `marketplaces/` — **설치하지 않은 것까지** 담은 카탈로그
 * 클론이 섞여 있다. 정본은 `~/.claude/plugins/installed_plugins.json` 이고
 * 플러그인당 `installPath` 를 **하나만** 지목한다.
 *
 * 좁혀서 다시 세니 숫자가 이렇게 바뀌었다(2026-08-09 실측):
 *
 * | | 디스크 전체 | **실제 로드** |
 * |---|---|---|
 * | 스킬 | 209 | **60** |
 * | 이름 충돌 | 38개 이름 | **2개** (`frontend-design` · `skill-creator`) |
 * | 강한 트리거 겹침 | 41쌍 | **1쌍** |
 * | 자기 폴더 참조 없음 | 37 | **0** (7건 전부 저장소 루트에 실재하는 오탐이었다) |
 *
 * 즉 «`frontend-design` 8벌이 경쟁한다» 는 첫 보고는 **틀렸다** — 여덟 중
 * 여섯은 안 쓰이는 스냅샷과 카탈로그였고, 설명 차이는 한 플러그인의 **버전 간
 * 드리프트**였다. 다운로드 캐시의 정상 모습이다.
 *
 * **그래서 기본은 로드되는 것만 센다.** 디스크 전체를 보려면 `--all` 을 준다 —
 * 그때는 출력이 스스로 «로드되지 않는 것을 포함한다» 고 말한다.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** 스킬이 자기 폴더에 싣는다고 약속하는 하위 폴더 — 여기 가리킴은 실재해야 한다. */
const BUNDLED_PREFIX = /^(\.\/)?(references|scripts|assets|templates|examples)\//;

/**
 * 설명에서 빼는 낱말. 트리거 겹침을 재려면 «어느 스킬에나 나오는 말»을 빼야
 * 한다 — 안 빼면 모든 쌍이 겹쳐 보이고 순위가 뜻을 잃는다.
 */
const STOP = new Set(
  (
    'use when this the a an and or for to of in on with that if you your is are be it its as by from at not do using used ' +
    'claude user users any all only also more most other others than then there their them into over under about after before ' +
    'should must can could would may might will need needs needed want wants asks ask asking request requests requested ' +
    'skill skills file files folder directory create creating creates make makes making build building builds ' +
    'etc via per each one two both new like such same out up down off'
  ).split(/\s+/),
);

export function distinctiveTerms(description) {
  return [
    ...new Set(
      String(description)
        .toLowerCase()
        .replace(/[^a-z0-9가-힣\s-]/g, ' ')
        .split(/\s+/)
        .filter((word) => word.length > 2 && !STOP.has(word)),
    ),
  ];
}

/** `SKILL.md` 의 frontmatter 에서 발동을 정하는 두 값만 뽑는다. */
export function parseSkill(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return null;
  const frontmatter = {};
  let key = null;
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^([a-zA-Z-]+):\s*(.*)$/);
    if (kv) {
      key = kv[1];
      frontmatter[key] = kv[2].trim();
    } else if (key && /^\s+\S/.test(line)) {
      // YAML 접힌 줄(`|-` 뒤 여러 줄) — 설명이 길면 흔하다.
      frontmatter[key] += ` ${line.trim()}`;
    }
  }
  return { name: frontmatter.name ?? null, description: frontmatter.description ?? '', body: match[2] };
}

/** 본문이 가리키는 파일 참조를 뽑아 «자기 폴더» 와 «조건부» 로 가른다. */
export function classifyReferences(body) {
  const bundled = new Set();
  const conditional = new Set();
  // 세 번째 갈래는 `classifyReferences` 가 아니라 실재 확인 단계에서 갈린다 —
  // 같은 `scripts/x.mjs` 가 스킬 폴더 기준일 수도, 저장소 루트 기준일 수도
  // 있어서 문자열만으로는 못 가른다(아래 `auditSkills` 의 repoRoot 확인).
  for (const hit of body.matchAll(
    /(?:^|[\s(`'"])([A-Za-z0-9_./-]+\.(?:md|py|js|mjs|ts|sh|json|csv|txt))/g,
  )) {
    const ref = hit[1];
    if (ref.startsWith('http') || ref.includes('://')) continue;
    (BUNDLED_PREFIX.test(ref) ? bundled : conditional).add(ref);
  }
  return { bundled: [...bundled], conditional: [...conditional] };
}

export function findSkillFiles(root) {
  const out = [];
  const walk = (dir) => {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === 'SKILL.md') out.push(full);
    }
  };
  walk(root);
  // 마켓플레이스가 싣는 빈 템플릿은 설치된 스킬이 아니다.
  return out.filter((file) => !/\/template\//.test(file));
}

export function auditSkills(skills, { exists = fs.existsSync, repoRoot = process.cwd() } = {}) {
  const byName = new Map();
  for (const skill of skills) {
    if (!byName.has(skill.name)) byName.set(skill.name, []);
    byName.get(skill.name).push(skill);
  }

  const duplicates = [...byName.entries()]
    .filter(([, copies]) => copies.length > 1)
    .map(([name, copies]) => ({
      name,
      copies: copies.length,
      // 설명까지 다르면 «발동 조건이 다른 것들이 같은 이름으로 경쟁» 한다.
      descriptionsDiffer: new Set(copies.map((c) => c.description)).size > 1,
      files: copies.map((c) => c.file),
    }))
    .sort((a, b) => b.copies - a.copies);

  const overlaps = [];
  for (let i = 0; i < skills.length; i += 1) {
    for (let j = i + 1; j < skills.length; j += 1) {
      const a = skills[i];
      const b = skills[j];
      if (a.name === b.name) continue; // 이름 충돌은 위에서 따로 센다
      const termsB = new Set(b.terms);
      const shared = a.terms.filter((term) => termsB.has(term));
      if (shared.length < 3) continue;
      const union = new Set([...a.terms, ...b.terms]).size;
      overlaps.push({ a: a.name, b: b.name, shared, score: Number((shared.length / union).toFixed(3)) });
    }
  }
  overlaps.sort((x, y) => y.score - x.score);

  let bundledTotal = 0;
  let repoRelative = 0;
  const bundledMissing = [];
  let conditionalTotal = 0;
  let conditionalMissing = 0;
  for (const skill of skills) {
    const dir = path.dirname(skill.file);
    const refs = classifyReferences(skill.body);
    for (const ref of refs.bundled) {
      bundledTotal += 1;
      if (exists(path.resolve(dir, ref))) continue;
      /*
       * ⚠️ **저장소 루트에서 한 번 더 찾아본다** (2026-08-09 정정).
       * `scripts/…` 로 시작하는 참조는 스킬이 자기 폴더에 싣는 것일 수도 있고
       * **그 스킬을 쓰는 저장소의 스크립트**일 수도 있다 — 문자열만으로는 못
       * 가른다. 이 확인을 안 넣었을 때 우리 스킬 7건이 전부 「깨진 참조」로
       * 보고됐는데, 일곱 다 저장소 루트에 실재했다(`scripts/measure-contrast.mjs`
       * 등). 계기가 멀쩡한 것을 결함이라 부른 것이다.
       */
      if (exists(path.resolve(repoRoot, ref))) {
        repoRelative += 1;
        continue;
      }
      bundledMissing.push({ name: skill.name, ref, file: skill.file });
    }
    for (const ref of refs.conditional) {
      conditionalTotal += 1;
      if (!exists(path.resolve(dir, ref))) conditionalMissing += 1;
    }
  }

  return {
    total: skills.length,
    uniqueNames: byName.size,
    duplicates,
    overlaps,
    references: { bundledTotal, bundledMissing, repoRelative, conditionalTotal, conditionalMissing },
    withBoundary: skills.filter((s) =>
      /do not use|don't use|not for|instead of|rather than|대신|쓰지 않/i.test(s.description),
    ).length,
  };
}

/**
 * **실제로 로드되는 플러그인 뿌리** — `installed_plugins.json` 이 정본이다.
 * 플러그인당 `installPath` 를 하나만 지목하므로, 그것만 훑으면 다운로드
 * 스냅샷과 카탈로그 클론이 자동으로 빠진다.
 */
export function installedPluginRoots(home, readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'))) {
  try {
    const manifest = readJson(path.join(home, '.claude', 'plugins', 'installed_plugins.json'));
    const out = [];
    for (const entries of Object.values(manifest?.plugins ?? {})) {
      for (const entry of entries ?? []) {
        if (typeof entry?.installPath === 'string' && entry.installPath) out.push(entry.installPath);
      }
    }
    return [...new Set(out)];
  } catch {
    // 정본이 없으면 플러그인 스킬은 세지 않는다 — 부풀린 숫자를 내는 것보다
    // 「못 셌다」가 낫다. `--all` 을 주면 디스크 전체를 본다.
    return [];
  }
}

function loadSkills(roots) {
  const skills = [];
  for (const [scope, root] of roots) {
    for (const file of findSkillFiles(root)) {
      const parsed = parseSkill(fs.readFileSync(file, 'utf8'));
      if (!parsed?.name) continue;
      skills.push({ ...parsed, file, scope, terms: distinctiveTerms(parsed.description) });
    }
  }
  return skills;
}

function main() {
  const args = process.argv.slice(2);
  const extra = args.filter((a) => !a.startsWith('--'));
  const home = os.homedir();
  const scanAll = args.includes('--all');
  const roots = extra.length
    ? extra.map((r) => ['arg', path.resolve(r)])
    : scanAll
      ? [
          ['personal', path.join(home, '.claude', 'skills')],
          ['disk', path.join(home, '.claude', 'plugins')],
          ['project', path.join(process.cwd(), '.claude', 'skills')],
        ]
      : [
          ['personal', path.join(home, '.claude', 'skills')],
          ...installedPluginRoots(home).map((r) => ['plugin', r]),
          ['project', path.join(process.cwd(), '.claude', 'skills')],
        ];

  const skills = loadSkills(roots);
  if (skills.length === 0) {
    console.log('[skill-audit] 스킬을 하나도 못 찾았다 — 경로를 인자로 넘기거나 설치 위치를 확인하라.');
    process.exit(0);
  }
  const report = auditSkills(skills);
  const scopes = skills.reduce((acc, s) => ((acc[s.scope] = (acc[s.scope] ?? 0) + 1), acc), {});

  console.log(
    `[skill-audit] ${scanAll ? '⚠️ 디스크 전체(로드되지 않는 스냅샷·카탈로그 포함)' : '실제 로드되는 스킬'} ` +
      `${report.total}개 · 고유 이름 ${report.uniqueNames}개 (${Object.entries(scopes)
        .map(([k, v]) => `${k}=${v}`)
        .join(' ')})`,
  );
  if (!scanAll && !skills.some((s) => s.scope === 'plugin')) {
    console.log('   ⚠️ installed_plugins.json 을 못 읽어 플러그인 스킬은 세지 않았다 (--all 로 디스크 전체)');
  }

  console.log(`\n① 이름 충돌 — 같은 이름 ${report.duplicates.length}개, 사본 ${report.total - report.uniqueNames}개 초과`);
  const risky = report.duplicates.filter((d) => d.descriptionsDiffer);
  console.log(`   그중 설명까지 서로 다른 것: ${risky.length}개 ← 발동 조건이 다른 것들이 같은 이름으로 경쟁한다`);
  for (const dup of risky.slice(0, 6)) console.log(`   ✗ ${dup.name} × ${dup.copies}`);

  const strong = report.overlaps.filter((o) => o.score >= 0.25);
  console.log(`\n② 트리거 겹침 — 후보 ${report.overlaps.length}쌍 · 강한 겹침(≥0.25) ${strong.length}쌍`);
  for (const pair of strong.slice(0, 6)) {
    console.log(`   ${pair.score}  ${pair.a} ↔ ${pair.b}  [${pair.shared.slice(0, 5).join(', ')}]`);
  }
  console.log(`   설명에 경계("Do not use for X")를 적은 스킬: ${report.withBoundary}/${report.total}`);

  const { bundledTotal, bundledMissing, conditionalTotal, conditionalMissing } = report.references;
  console.log(`\n③ 자기 폴더 참조 — ${bundledTotal}건 중 ${bundledMissing.length}건 없음`);
  for (const miss of bundledMissing.slice(0, 6)) console.log(`   ✗ ${miss.name}: ${miss.ref}`);
  console.log(
    `   (저장소 루트에서 찾은 것 ${report.references.repoRelative}건은 결함이 아니다 — 스킬이 아니라 그 저장소의 스크립트다)`,
  );
  console.log(
    `   (프로젝트 쪽 조건부 참조 ${conditionalTotal}건 중 ${conditionalMissing}건은 없어도 정상 — 「있으면 읽어라」이므로 결함이 아니다)`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main();
}
