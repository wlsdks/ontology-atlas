/**
 * 디자인 «규격» 센서스 — 문자열 diff 가 아니라 **어휘와 값의 변화**를 본다.
 *
 * ## 왜 파일이 diff 에 있는지로 판정하지 않는가
 *
 * `.claude/rules/design.md` 의 「규격을 바꾸려면 「체계」를 부른다」 절이
 * 트리거 파일을 이름으로 댄다. 그런데 그 파일들은 이 저장소에서 **가장 자주
 * 만져지는 파일**이다 — 최근 200 커밋 중 `app/globals.css` 하나만 해도 3분의
 * 1 이상이 건드린다. 「diff 에 있으면 원장 필수」로 걸면 오타 수정 · 주석 ·
 * 포맷팅 · 표면 하나짜리 색 조정까지 전부 걸려서, 게이트가 규격을 지키는 게
 * 아니라 **원장을 의미 없는 줄로 채우게** 만든다. 그건 강제가 아니라 소음이고,
 * 이 저장소는 그 실패를 이미 겪었다(`shadow-[` 통째 금지 → lint 144 → 548).
 *
 * ## 그래서 무엇을 «규격 변경» 으로 보는가
 *
 * 한 문장으로: **어휘(고를 수 있는 것의 목록)와 램프(그 목록이 내는 값).**
 * 구현·주석·산문은 보지 않는다.
 *
 * | 출처 | 세는 것 | 안 세는 것 |
 * |---|---|---|
 * | `app/globals.css` | 램프 토큰(타입 · 행간 · 반경 · 그림자 · 컨트롤 높이 · 콘텐츠 아이콘 · 스케일 고정 계약)의 **이름과 값** | 표면 전용 토큰, 주석, 순서, 공백 |
 * | `src/shared/ui/control-class.ts` | cva **축 이름 · 축의 선택지 · 기본값** (모양/크기/톤/scope…) | 각 선택지가 내는 클래스 문자열 |
 * | `src/shared/ui/controls.tsx` · `surface.tsx` | **export 되는 프리미티브 이름** | 내부 구현 |
 * | `.claude/rules/design.md` | 「스케일 고정 계약」 절의 **수치와 토큰 이름** | 그 절의 문장 |
 *
 * 판정의 성격이 층마다 다르다는 점이 중요하다:
 *
 * - **어휘의 증감**(축·선택지·프리미티브)은 «시스템에 고를 것이 늘었다» 이므로
 *   항상 규격 변경이다. 실제로 design.md 가 지목한 사고가 정확히 이것이다 —
 *   「규칙이 벽에 부딪힐 때마다 예외 축을 더한」 결과 한 화면에 컨트롤 높이가
 *   8~9종이 됐다.
 * - **램프 값의 변경**도 규격 변경이다. `--text-body` 를 12.5 → 13 으로 옮기는
 *   것은 앱 전체를 옮기는 결정이지 「값 하나 수정」이 아니다.
 * - **선택지가 내는 클래스 문자열**은 세지 않는다. `chip` 이 `gap-1.5` 를
 *   `gap-2` 로 바꾸는 것은 그 모양 안의 조정이고, 램프 밖으로 새면 이미
 *   `control-class.contract.test.ts` 가 잡는다. 여기까지 걸면 오탐이 이긴다.
 *
 * ## 왜 `--color-*` 전체는 세지 않는가
 *
 * globals.css 의 `--color-*` 는 200개가 넘고 대부분이 **한 표면 전용 알파
 * 사다리**다. 전수를 램프로 보면 색 하나 조정할 때마다 원장을 요구하게 되고,
 * 그건 위에서 말한 소음 실패로 곧장 간다. 색 규격의 진짜 게이트는 이미 따로
 * 있다 — 헌장(무채색 + 단일 인디고)은 `.claude/rules/forbidden.md` 와
 * `accentTintPairingSelectors` lint 가, 대비는 `contrast-ratchet` 이 지킨다.
 * 여기서 세는 색은 **팔레트의 뿌리**(hue 를 정의하는 solid 값)뿐이다: 새 hue
 * 가 등장하거나 브랜드 인디고가 움직이면 그건 어휘의 변화다.
 */

import ts from 'typescript';

/** 게이트가 트리거 목록을 읽는 정본. 목록을 여기 복제하지 않는다. */
export const SPEC_RULE_DOC = '.claude/rules/design.md';

/** 정본 문서 안에서 목록이 사는 절. 제목이 바뀌면 파서가 소리 내어 죽는다. */
export const SPEC_RULE_SECTION = '규격을 바꾸려면 「체계」를 부른다';

/** design.md 「스케일 고정 계약」 절 — 수치·토큰 센서스의 대상. */
export const SCALE_CONTRACT_SECTION = '스케일 고정 계약';

/**
 * globals.css 에서 램프로 세는 토큰.
 *
 * 이름 있는 사다리(타입 · 행간 · 반경 · 그림자 · 컨트롤 높이 · 콘텐츠 아이콘)와 design.md 가
 * 「스케일 고정 계약」으로 못박은 두 치수다. 앞의 넷은 `--<ramp>-<step>` 이라는
 * 규칙적 이름을 갖고 전부 합쳐 40개 남짓이라, 여기 걸리면 거의 확실히 규격이다.
 */
const RAMP_TOKEN_PATTERN =
  /^--(?:text|leading|radius|shadow|control-h|icon)-|^--(?:chrome-tile-size|app-nav-rail-icon-size)$/;

/**
 * 팔레트의 뿌리 — hue 를 정의하는 solid 색.
 *
 * 알파 사다리(`--color-indigo-a08` …)와 표면 전용 색은 제외한다. 걸리는 것은
 * 바탕 3단 · 글자 4단 · 인디고 3단 · 신호 4종처럼 **「이 앱의 색이 무엇인가」를
 * 정의하는** 값들이고, 이게 움직이면 헌장이 움직인 것이다.
 */
const PALETTE_ROOT_PATTERN =
  /^--color-(?:canvas|panel|elevated|text-[a-z]+|indigo-(?:brand|accent|hover)|status-[a-z]+)$/;

/**
 * **cva 로 축·선택지를 내는 값 층 파일** — 센서스가 「이름과 값」을 센다.
 * 2026-08-15 에 `badge-class.ts`(정적 배지 기하)가 합류했다.
 */
const VARIANT_VOCABULARY_FILES = new Set([
  'src/shared/ui/control-class.ts',
  'src/shared/ui/badge-class.ts',
]);

/** 이 파일 자신은 램프 어휘를 갖지 않는다 — export 목록만 센다. */
const PRIMITIVE_EXPORT_FILES = new Set([
  'src/shared/ui/controls.tsx',
  'src/shared/ui/surface.tsx',
  // 2026-08-15 「체계」석 비준으로 신설된 모달 정본 — 무엇을 내보내느냐가 계약.
  'src/shared/ui/dialog.tsx',
  // 2026-08-15 (2) 폼 행동 층 — Input/Textarea · Checkbox.
  'src/shared/ui/input.tsx',
  'src/shared/ui/checkbox.tsx',
  // 2026-08-15 (3) 배타 단일선택 — SegmentedControl.
  'src/shared/ui/segmented-control.tsx',
  /*
   * 2026-08-15 (8) radiogroup **행동 층** — 이 파일이 내보내는 것이 곧 계약이다
   * (`groupProps`/`itemProps` 의 모양이 바뀌면 그것을 입은 모든 그릇이 바뀐다).
   * 값은 한 줄도 안 내므로 어휘 census 가 아니라 export census 가 맞다.
   */
  'src/shared/lib/use-roving-radio-group.ts',
]);

/**
 * **값 자체가 규격인 파일** — 내보내는 이름이 아니라 그 문자열이 규격이다.
 *
 * `PRIMITIVE_EXPORT_FILES` 의 census 는 **이름만** 센다. 부품 파일에서는 그게
 * 맞다(무엇을 내보내느냐가 계약이고 내부 구현은 자유다). 그런데 `page-frame.ts`
 * 는 내용이 전부 값이라 이름 census 로는 `md:pt-12` → `md:pt-6` 같은 규격 변경이
 * **하나도 안 잡힌다** — 실측으로 확인했고(빈 Map), 그 상태로 감시 목록에 넣으면
 * 「지켜지는 척」만 하게 된다.
 */
const VALUE_EXPORT_FILES = new Set(['src/shared/ui/page-frame.ts']);

/**
 * 정본 문서에서 트리거 파일 목록을 **유도한다**.
 *
 * 복제하면 두 벌이 되고, 두 벌이 있는데 게이트가 없으면 어긋나는 쪽이
 * 기본값이다(이 저장소가 스킬 사본에서 실제로 겪은 실패). 그래서 목록은
 * design.md 한 곳에만 있고 여기서는 읽기만 한다. 어긋남 자체는
 * `tests/contract/design-spec-ledger.contract.test.ts` 가 잡는다.
 */
export function parseTriggerFiles(designMdText) {
  const section = extractSection(designMdText, SPEC_RULE_SECTION);
  if (section === null) {
    throw new Error(
      `[design-spec] ${SPEC_RULE_DOC} 에서 「${SPEC_RULE_SECTION}」 절을 못 찾았다 — ` +
        `절 제목이 바뀌었으면 이 상수도 같이 고쳐라.`,
    );
  }
  // ⚠️ 절 **전체**에서 백틱 경로를 긁으면 안 된다. 이 절의 마지막 문단이
  // 게이트 파일(`…design-council.contract.test.ts`)을 인용하는데, 첫 구현이
  // 그걸 트리거로 집어삼켰다 — 자기를 감시하는 파일이 감시 대상이 되는 셈이다.
  // 그래서 **목록 줄**(`- \`path\` — 설명`)만 읽는다. 형식이 곧 계약이다.
  const files = [];
  for (const line of section.split('\n')) {
    const match = /^-\s+`([A-Za-z0-9_./[\]-]+\.(?:ts|tsx|css|md))`/.exec(line.trim());
    if (match && !files.includes(match[1])) files.push(match[1]);
  }
  if (files.length === 0) {
    throw new Error(
      `[design-spec] 「${SPEC_RULE_SECTION}」 절에 «- \`경로\`» 형식의 목록 줄이 하나도 없다.`,
    );
  }
  return files;
}

/** `## <제목>` 부터 다음 같은 레벨 제목 직전까지. */
function extractSection(markdown, heading) {
  const lines = markdown.split('\n');
  const start = lines.findIndex((line) => line.startsWith('## ') && line.includes(heading));
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^#{1,2} /.test(line));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n');
}

/**
 * 한 파일의 규격 센서스. 키는 사람이 읽을 수 있는 규격 이름, 값은 그 규격이
 * 오늘 내는 값. 규격을 안 갖는 파일이면 빈 Map.
 */
export function censusFor(path, text) {
  if (text === null || text === undefined) return new Map();
  if (path === 'app/globals.css') return cssRampCensus(text);
  if (VARIANT_VOCABULARY_FILES.has(path)) return variantVocabularyCensus(path, text);
  if (PRIMITIVE_EXPORT_FILES.has(path)) return exportedPrimitiveCensus(path, text);
  if (VALUE_EXPORT_FILES.has(path)) return exportedValueCensus(path, text);
  if (path === SPEC_RULE_DOC) return scaleContractCensus(text);
  return new Map();
}

/** 램프 토큰 이름 → 값. 주석·공백·선언 순서는 정규화로 사라진다. */
function cssRampCensus(css) {
  const census = new Map();
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
  for (const [, name, rawValue] of stripped.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;{}]+);/gi)) {
    if (!RAMP_TOKEN_PATTERN.test(name) && !PALETTE_ROOT_PATTERN.test(name)) continue;
    const value = rawValue.replace(/\s+/g, ' ').trim();
    const key = `token ${name}`;
    // 같은 토큰이 여러 블록(:root · media query)에서 선언된다. 값이 다르면 둘 다
    // 규격이므로 둘 다 남긴다 — 하나만 고치는 것도 규격 변경이다.
    const previous = census.get(key);
    if (previous === undefined) census.set(key, value);
    else if (!previous.split(' | ').includes(value)) census.set(key, `${previous} | ${value}`);
  }
  return census;
}

/**
 * cva 의 `variants` / `defaultVariants` 어휘.
 *
 * 정규식이 아니라 TypeScript 파서로 읽는다 — 이 파일은 주석 안에 표와 코드
 * 예시가 잔뜩 들어 있어서, 「`shape:` 로 시작하는 줄」 같은 텍스트 규칙은
 * 주석까지 규격으로 센다.
 */
function variantVocabularyCensus(path, source) {
  const census = new Map();
  const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);

  const visit = (node) => {
    if (ts.isPropertyAssignment(node) && ts.isObjectLiteralExpression(node.initializer)) {
      const name = propertyName(node);
      if (name === 'variants') {
        for (const axis of node.initializer.properties) {
          if (!ts.isPropertyAssignment(axis) || !ts.isObjectLiteralExpression(axis.initializer)) {
            continue;
          }
          const axisName = propertyName(axis);
          const options = axis.initializer.properties
            .filter((option) => ts.isPropertyAssignment(option))
            .map((option) => propertyName(option))
            .filter(Boolean)
            .sort();
          census.set(`axis ${axisName}`, options.join(' '));
        }
      } else if (name === 'defaultVariants') {
        for (const entry of node.initializer.properties) {
          if (!ts.isPropertyAssignment(entry)) continue;
          census.set(`default ${propertyName(entry)}`, entry.initializer.getText(sourceFile));
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return census;
}

function propertyName(node) {
  const name = node.name;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  return name?.getText?.() ?? '';
}

/** export 되는 프리미티브 이름 집합 — 시스템이 제공하는 부품 목록. */
/** 내보낸 문자열 상수의 **값**을 센다 — 이름이 같아도 값이 바뀌면 규격 변경이다. */
function exportedValueCensus(path, source) {
  const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const census = new Map();

  const visit = (node) => {
    if (
      ts.isVariableStatement(node) &&
      (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export) !== 0
    ) {
      for (const declaration of node.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) continue;
        const initializer = declaration.initializer;
        // `as const` 를 벗긴다 — 규격은 안쪽 리터럴이다.
        const literal =
          initializer && ts.isAsExpression(initializer) ? initializer.expression : initializer;
        if (literal && ts.isStringLiteral(literal)) {
          census.set(`value ${declaration.name.text}`, literal.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return census;
}

function exportedPrimitiveCensus(path, source) {
  const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const names = new Set();

  const visit = (node) => {
    const exported = (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export) !== 0;
    if (exported) {
      if (ts.isVariableStatement(node)) {
        for (const declaration of node.declarationList.declarations) {
          if (ts.isIdentifier(declaration.name)) names.add(declaration.name.text);
        }
      } else if (node.name && ts.isIdentifier(node.name)) {
        names.add(node.name.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return names.size === 0 ? new Map() : new Map([[`exports ${path}`, [...names].sort().join(' ')]]);
}

/**
 * design.md 「스케일 고정 계약」 절의 수치·토큰 센서스.
 *
 * 이 절은 산문인데 그 안의 **숫자와 토큰 이름**은 규격이다(36px 필 · 20px 레일
 * 아이콘 · `--chrome-tile-size` …). 문장을 통째로 비교하면 오탈자 수정까지
 * 걸리므로 값만 뽑는다.
 */
function scaleContractCensus(designMdText) {
  const section = extractSection(designMdText, SCALE_CONTRACT_SECTION);
  if (section === null) return new Map();
  const numbers = [...section.matchAll(/\b(\d+(?:\.\d+)?)(px)\b/g)].map((match) => match[0]);
  // `--leading-*` 같은 산문 속 와일드카드가 꼬리 하이픈째 잡히지 않게 자른다.
  const tokens = [...section.matchAll(/--[a-z0-9-]+/g)]
    .map((match) => match[0].replace(/-+$/, ''))
    .filter((token) => token.length > 2);
  const census = new Map();
  if (numbers.length > 0) census.set('scale-contract 수치', [...new Set(numbers)].sort().join(' '));
  if (tokens.length > 0) census.set('scale-contract 토큰', [...new Set(tokens)].sort().join(' '));
  return census;
}

/** 두 센서스의 차이. 빈 배열이면 규격은 그대로다. */
export function diffCensus(before, after) {
  const changes = [];
  for (const [key, value] of after) {
    if (!before.has(key)) changes.push({ kind: 'added', key, to: value });
    else if (before.get(key) !== value) {
      changes.push({ kind: 'changed', key, from: before.get(key), to: value });
    }
  }
  for (const [key, value] of before) {
    if (!after.has(key)) changes.push({ kind: 'removed', key, from: value });
  }
  return changes;
}

export function describeChange(path, change) {
  if (change.kind === 'added') return `규격 추가: ${path} — ${change.key} = ${change.to}`;
  if (change.kind === 'removed') return `규격 제거: ${path} — ${change.key} (였던 값: ${change.from})`;
  return `규격 값 변경: ${path} — ${change.key}: ${change.from} → ${change.to}`;
}
