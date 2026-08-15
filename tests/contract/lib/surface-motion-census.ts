import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * 하드컷 센서스 — **소스 전체에서 「조건부로 나타나는데 나가는 길이 없는 표면」을 센다.**
 *
 * 종전에는 손으로 쓴 등록부를 순회했고, 그 등록부가 비면 게이트가 공집합 위에서
 * 돌았다. 그때 「하드컷 0」은 제품에 대한 참이 아니라 **빈 목록에 대한 참**이다.
 * 이 모듈이 그 자리를 대신한다: 목록이 아니라 `src/`·`app/` 전수가 입력이다.
 *
 * ## 무엇을 「등장」으로 세는가 — 세 부류를 갈라야 수가 뜻을 갖는다
 *
 * 구 등록부 머리말이 이미 경고했다: 접미사로 세면 과다 계수가 된다. 실제로
 * 부모의 렌더 게이트를 따라가면 셋으로 갈린다.
 *
 * | 부류 | 이 센서스는 | 어떻게 가르나 |
 * |---|---|---|
 * | 부모가 조건부로 그린다 | **센다** | 호출 자리가 `{cond && <X/>}` 이거나 `{cond ? <X/> : null}` |
 * | 항상 렌더된다 | 안 센다 | **구조적으로 제외** — 조건부 호출 자리만 보므로 애초에 안 잡힌다 |
 * | 부모가 이미 애니메이션한다 | 안 센다 | 대안 가지가 **무언가를 그리면** 등장이 아니라 «교체»다. 이미 마운트된 컨테이너 안에서 내용만 바뀌는 자리(설정 시트의 절, 연결 시트의 단계 갈래)가 전부 여기로 빠진다 |
 *
 * 이 셋째 줄이 이 센서스의 핵심 판별식이다. 실측으로 세 자리를 걸러냈다 —
 * `AgentGlobalScopePanel`(연결 시트의 범위 갈래) · `VaultAgentSetupPanel` ·
 * `ProjectQuickEditPanel`. 구 등록부가 「부모가 이미 애니메이션한다」고 손으로
 * 적어 두었던 부류가 **기계적으로** 걸러진다.
 *
 * ## 상호작용할 수 없는 원소는 표면이 아니다
 *
 * `pointer-events-none` 이거나 `aria-hidden` 인 루트는 세지 않는다. 근거는 두 겹이다:
 *
 * 1. **모션 예산 규칙이 이미 그렇게 말한다** — `design.md`: *"빈도가 예산을 깎는다.
 *    호버/포커스 표면은 `0~--motion-fast`."* 포인터를 따라다니는 수동 판독물은
 *    0ms 가 **허용된 값**이지 결함이 아니다. 실측: 지도의 엣지·클러스터 호버
 *    카드 둘이 정확히 이 부류다(루트가 `pointer-events-none fixed z-40`).
 * 2. 투어 앵커(`aria-hidden` + 크기 0)처럼 **보이지도 눌리지도 않는** 위치
 *    마커가 여기서 빠진다. 이 제외를 넣기 전 실측 오탐률이 약 40% 였고,
 *    넣은 뒤 11건 중 1건(경계 사례)으로 내려갔다.
 *
 * ⚠️ **이 제외는 방향이 있다.** 「정상 사용을 살린다」는 면제가 「비정상 사용도
 * 살린다」가 되는지 함께 물어야 한다(그림자 룰이 `var(` 면제로 샜던 그 교훈).
 * 여기서는 좁다 — 루트가 정말로 못 눌리는 원소만 빠지고, 그런 원소는 퇴장 창을
 * 가질 이유 자체가 없다(닫힐 때 포인터가 이미 떠났다).
 */

/** 표면 이름 관례. 접미사가 아니라 **호출 자리**가 판정하지만, 후보를 좁히는 데 쓴다. */
const SURFACE_SUFFIXES = [
  'Panel',
  'Sheet',
  'Modal',
  'Drawer',
  'Popover',
  'Dialog',
  'Overlay',
  'Menu',
  'Tooltip',
  'Toast',
  'HoverCard',
  'Banner',
];

/**
 * 표면에 등장/퇴장을 주는 **인정되는 기제**.
 *
 * ⚠️ 판정은 소스 **문자열 포함**이라 주석도 코드로 읽힌다 — 프로브 픽스처에
 * 기제 이름을 적으면 프로브가 조용히 죽는다.
 *
 * `animate-out` / `data-[state=closed]` 은 Radix 계열의 퇴장이다. 이 둘이 없던
 * 첫 판이 `Tooltip` 을 하드컷으로 잘못 셌다 — **기제 목록이 짧으면 오탐이 된다.**
 * 반대로 `map-overlay-in` 같은 **등장 전용** 클래스는 여기 넣지 않는다: 나가는
 * 길이 없는 것이 정확히 이 게이트가 세는 부채다.
 */
export const MOTION_MECHANISMS = [
  'AnimatePresence',
  'usePanelPresence',
  'useSurfaceSwap',
  '<Surface',
  // Dialog 는 내부에 AnimatePresence 를 품은 모달 프리미티브다 — 조건부로
  // 마운트돼도 등장·퇴장을 스스로 진다 (2026-08-15 체계석 비준, dialog.tsx).
  '<Dialog',
  'animate-out',
  'data-[state=closed]',
];

export interface HardCut {
  /** 표면의 이름(명명 컴포넌트) 또는 `<div>` 등 인라인 태그. */
  readonly what: string;
  /** 판정 근거가 사는 파일 — 명명 컴포넌트는 정의 파일, 인라인은 그 자리. */
  readonly file: string;
  /** 조건부로 그리는 호출 자리들. */
  readonly at: readonly string[];
  readonly kind: 'named' | 'inline';
}

export function walkTsx(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === 'node_modules' || name === '.next') continue;
      walkTsx(p, out);
    } else if (name.endsWith('.tsx') && !name.endsWith('.test.tsx')) {
      out.push(p);
    }
  }
  return out;
}

function resolveImport(root: string, fromFile: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = join(root, 'src', spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(fromFile), spec);
  else return null;
  for (const c of [`${base}.tsx`, `${base}.ts`, join(base, 'index.tsx'), join(base, 'index.ts')]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

/**
 * 배럴(`index.ts`)을 따라 실물 정의 파일에 닿는다.
 *
 * ★ 이걸 안 하면 재수출 뒤의 파일 대신 **배럴을 읽고** «기제 없음» 이라고 말한다.
 * 첫 측정에서 실제로 그랬다 — 위젯 배럴을 거치는 표면 다섯이 전부 거짓 하드컷으로
 * 잡혔다. 구조에 의한 오탐이라 값이 아니라 해석이 틀린 것이다.
 */
function resolveComponent(root: string, file: string | null, name: string, seen = new Set<string>()): string | null {
  if (!file || seen.has(file + name) || !existsSync(file)) return file;
  seen.add(file + name);
  const src = readFileSync(file, 'utf8');
  const defines = new RegExp(`(function|const|class)\\s+${name}\\b`);
  if (defines.test(src)) return file;
  for (const m of src.matchAll(/export\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g)) {
    const names = m[1].split(',').map((r) => r.trim().split(/\s+as\s+/).pop()!.trim());
    if (names.includes(name)) {
      const next = resolveImport(root, file, m[2]);
      if (next) return resolveComponent(root, next, name, seen);
    }
  }
  for (const m of src.matchAll(/export\s+\*\s+from\s+['"]([^'"]+)['"]/g)) {
    const next = resolveImport(root, file, m[1]);
    if (next && existsSync(next) && defines.test(readFileSync(next, 'utf8'))) return next;
  }
  return file;
}

/**
 * `?` 삼항의 **대안 가지**를 돌려준다 — JSX 를 파싱하지 않고 괄호/중괄호/대괄호
 * 깊이만 센다.
 *
 * ★ JSX 트리를 걸으려던 첫 판은 두 번 틀렸다: `onSave={() => {` 의 `=>` 를 여는
 * 태그의 끝으로 읽었고(컨트롤 래칫 머리말이 이미 적어 둔 그 함정), 중첩 컨테이너의
 * 닫는 태그를 잘못 짝지었다. 그 결과 **진짜 등장인 `DeltaPreviewModal` 이 「교체」로
 * 분류**돼 센서스에서 통째로 빠졌다. 깊이 스캔은 두 함정이 다 없다.
 */
export function ternaryAlternative(src: string, qmark: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = qmark + 1; i < src.length; i += 1) {
    const c = src[i];
    if (quote) {
      if (c === quote && src[i - 1] !== '\\') quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      quote = c;
      continue;
    }
    if (c === '(' || c === '{' || c === '[') depth += 1;
    else if (c === ')' || c === '}' || c === ']') {
      depth -= 1;
      if (depth < 0) return '';
    } else if (c === ':' && depth === 0) return src.slice(i + 1, i + 80).trim();
  }
  return '';
}

/**
 * 조건부 가지의 **본문 전체**를 돌려준다 — 여는 태그가 아니라 자식까지.
 *
 * ★ 포지셔너 때문에 필요하다. 지도의 노드 팝오버는 `{mounted && <div 포지셔너>
 * <TopologyV2DetailPanel open onExited/></div>}` 인데, **퇴장 창의 주인은 자식
 * 안의 `<Surface>`** 이고 이 래퍼는 그 통보(`onExited`)에 맞춰 내려가는 배치용
 * 껍데기다. 여는 태그만 보면 「나가는 길 없음」으로 읽힌다.
 *
 * `design.md` 가 같은 함정을 이미 적어 뒀다 — *"잴 원소를 틀리면 결론이 통째로
 * 뒤집힌다: 팝오버의 포지셔너(전이가 없는 게 정상인 배치용 래퍼)를 재고 «주인공이
 * 전이를 한 톨도 안 받는다»를 최우선 결함으로 냈는데, 실제 애니메이션은 그 자식
 * 패널에 있었다."* 실측으로 이 자리가 정확히 그렇게 한 번 잘못 세어졌다.
 */
function branchSource(src: string, from: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = from; i < src.length; i += 1) {
    const c = src[i];
    if (quote) {
      if (c === quote && src[i - 1] !== '\\') quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '(' || c === '{' || c === '[') depth += 1;
    else if (c === ')' || c === '}' || c === ']') {
      depth -= 1;
      if (depth < 0) return src.slice(from, i);
    } else if (c === ':' && depth === 0) return src.slice(from, i);
  }
  return src.slice(from, from + 4000);
}

/**
 * 자식이 퇴장을 지고 있다는 표식. `onExited` 는 이 저장소 `Surface` 계약의
 * **퇴장 완료 통보**라, 이게 있으면 나가는 길의 주인이 안쪽에 있다는 뜻이다.
 */
const EXIT_DELEGATED = [...MOTION_MECHANISMS, 'onExited'];

/** 대안 가지가 아무것도 안 그리면 «등장», 무언가 그리면 «교체». */
function branchAppears(src: string, matchStart: number, matchText: string): boolean {
  if (matchText.includes('&&')) return true;
  const alt = ternaryAlternative(src, matchStart + matchText.indexOf('?')).replace(/^\(?\s*/, '');
  return alt === '' || /^(null|undefined|false)\b/.test(alt);
}

/** 루트가 못 눌리거나 AT 에 안 보이면 표면이 아니다. */
function notASurface(openingTag: string): boolean {
  return /pointer-events-none|aria-hidden/.test(openingTag);
}

/**
 * 여는 태그만 잘라 낸다 — **중괄호 깊이로 끊는다.**
 *
 * ★ 경계를 안 두면 판정이 태그 밖으로 샌다. 실측: 프로브 픽스처의 **주석**에
 * 적힌 `<div className="fixed …">` 가 뒤따르는 진짜 코드의 `z-50` 과 짝지어져
 * 한 자리를 두 번 셌다. 주석은 코드가 아니고, 다른 원소의 클래스도 이 원소의
 * 클래스가 아니다.
 *
 * 단순히 첫 `>` 를 찾으면 `onClick={() => …}` 의 `=>` 에 걸린다 — 컨트롤 래칫
 * 머리말이 적어 둔 그 함정이라 같은 방식(중괄호 깊이)으로 끊는다.
 */
export function openingTag(source: string, ltIndex: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = ltIndex; i < source.length; i += 1) {
    const c = source[i];
    if (quote) {
      if (c === quote && source[i - 1] !== '\\') quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '{') depth += 1;
    else if (c === '}') depth -= 1;
    else if (c === '>' && depth === 0) return source.slice(ltIndex, i + 1);
  }
  return source.slice(ltIndex, ltIndex + 800);
}

/**
 * 전수 센서스. `roots` 는 보통 `['src', 'app']`.
 *
 * 목록이 아니라 **스캔 결과**를 돌려주므로, 새 표면을 아무 데나 놓아도 다음
 * 실행에서 저절로 잡힌다 — 등록부에 줄을 더해야 보이던 종전과 반대다.
 */
/**
 * **조건부로 나타나는 표면 전수** — 나가는 길의 유무와 **무관하게**.
 *
 * 하드컷 센서스의 분모다. 접근성 래칫이 「열린 상태를 몇 개나 재고 있나」를
 * 물을 때 이 수가 답이 된다 — 첫 화면만 재던 게이트는 이 분모를 한 번도
 * 갖지 못했고, 그래서 「위반 0」이 「연 적 없음」과 구별되지 않았다.
 */
export function censusAppearingSurfaces(root: string, roots: readonly string[] = ['src', 'app']): HardCut[] {
  return collect(root, roots, [], { onlyHardCuts: false });
}

export function censusHardCuts(root: string, roots: readonly string[] = ['src', 'app'], extraFiles: readonly string[] = []): HardCut[] {
  return collect(root, roots, extraFiles, { onlyHardCuts: true });
}

function collect(root: string, roots: readonly string[], extraFiles: readonly string[], opts: { onlyHardCuts: boolean }): HardCut[] {
  const files = roots.flatMap((r) => walkTsx(join(root, r))).concat(extraFiles.map((f) => (f.startsWith('/') ? f : join(root, f))));
  const rel = (f: string) => f.replace(`${root}/`, '');

  const namedSites = new Map<string, { def: string | null; at: string[] }>();
  const inline: HardCut[] = [];

  for (const file of files) {
    if (!existsSync(file)) continue;
    const src = readFileSync(file, 'utf8');

    const imports = new Map<string, string | null>();
    for (const m of src.matchAll(/import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g)) {
      const target = resolveImport(root, file, m[2]);
      for (const raw of m[1].split(',')) {
        const name = raw.trim().split(/\s+as\s+/).pop()!.trim();
        if (name) imports.set(name, target);
      }
    }
    for (const m of src.matchAll(/import\s+([A-Z][\w$]*)\s+from\s+['"]([^'"]+)['"]/g)) {
      imports.set(m[1], resolveImport(root, file, m[2]));
    }

    // ── 탐지기 ⓪ `<Surface open={…}>` — **전환된 표면 자신**
    //
    // ★ 이게 없으면 갚을수록 분모가 줄어든다. 전환하면 호출 자리가
    //   `{cond && <div className="fixed … z-50">}` 에서 `<Surface open={cond}>`
    //   로 바뀌는데, ①②는 **조건부 호출 자리**만 보므로 그 표면이 통째로
    //   시야에서 사라진다. 실측: 13건을 갚자 분모가 19 → 8 로 내려앉았다 —
    //   「위반 0」과 「안 보고 있음」이 다시 구별되지 않는 그 상태다.
    if (!opts.onlyHardCuts) {
      for (const m of src.matchAll(/<Surface[\s>]/g)) {
        const tag = openingTag(src, m.index!);
        if (!/\bopen[=\s]/.test(tag)) continue;
        const line = src.slice(0, m.index!).split('\n').length;
        inline.push({ what: '<Surface>', file: rel(file), at: [`${rel(file)}:${line}`], kind: 'named' });
      }
    }

    // ── 탐지기 ① 명명된 표면 컴포넌트
    for (const m of src.matchAll(/(&&|\?)\s*\(?\s*<([A-Z][\w$]*)/g)) {
      const name = m[2];
      if (!SURFACE_SUFFIXES.some((s) => name.endsWith(s))) continue;
      if (!branchAppears(src, m.index!, m[0])) continue;
      const line = src.slice(0, m.index!).split('\n').length;
      const def = imports.has(name) ? resolveComponent(root, imports.get(name)!, name) : file;
      const entry = namedSites.get(name) ?? { def, at: [] };
      entry.at.push(`${rel(file)}:${line}`);
      namedSites.set(name, entry);
    }

    // ── 탐지기 ② 인라인 오버레이 — 소유자 프로브가 쓴 바로 그 모양이다:
    //    `{open && <div className="fixed …">}`. 이름이 없으니 ①이 못 본다.
    for (const m of src.matchAll(/(&&|\?)\s*\(?\s*<(div|section|aside|nav)\s/g)) {
      const ltIndex = m.index! + m[0].length - m[2].length - 1;
      const tag = openingTag(src, ltIndex);
      if (!/className=\{?["'`][^"'`]*\b(fixed|absolute)\b[^"'`]*\bz-\d/.test(tag)) continue;
      if (notASurface(tag)) continue;
      if (!branchAppears(src, m.index!, m[0])) continue;
      // 나가는 길은 **이 가지 안**에 있어야 한다 — 파일 어딘가에 있는
      // `AnimatePresence` 는 이 원소의 것이 아니고, 반대로 자식이 지고 있으면
      // 이 래퍼는 포지셔너이지 표면이 아니다.
      //
      // ⚠️ 이 제외는 **분모에도** 걸어야 한다(2026-08-04). 안 걸면 포지셔너와
      //    그 안의 `<Surface>` 가 **한 표면을 두 번** 센다 — 실측 전례 그대로
      //    「잴 원소를 틀리면 수치가 나와도 틀린 수치」다.
      if (EXIT_DELEGATED.some((x) => branchSource(src, ltIndex).includes(x))) continue;
      const line = src.slice(0, ltIndex).split('\n').length;
      inline.push({ what: `<${m[2]}>`, file: rel(file), at: [`${rel(file)}:${line}`], kind: 'inline' });
    }
  }

  const named: HardCut[] = [];
  for (const [name, { def, at }] of namedSites) {
    if (!def || !existsSync(def)) continue;
    const defSrc = readFileSync(def, 'utf8');
    if (opts.onlyHardCuts && MOTION_MECHANISMS.some((x) => defSrc.includes(x))) continue;
    // 같은 이유의 중복 제거 — 정의 안의 `<Surface>` 가 이미 세어졌다.
    if (!opts.onlyHardCuts && /<Surface[\s>]/.test(defSrc)) continue;
    // 루트가 못 눌리는 수동 판독물(호버 카드)은 표면이 아니다.
    const rootLt = defSrc.search(/<(div|section|aside|nav)\s/);
    if (rootLt >= 0 && notASurface(openingTag(defSrc, rootLt))) continue;
    named.push({ what: name, file: rel(def), at, kind: 'named' });
  }

  return [...named, ...inline].sort((a, b) => a.file.localeCompare(b.file) || a.what.localeCompare(b.what));
}
